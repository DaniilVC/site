# Понятное дело - библиотеки
from fastapi import FastAPI, Depends, HTTPException, status, Query, WebSocket
from config import Config
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import SessionLocal, get_db, Base, engine
from models import User, UserRole, Schedule, Vessel, ScheduleStatus, BerthNumber, Company
from pwdlib import PasswordHash
from datetime import date, datetime, time, timedelta
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from schemas import ScheduleCreate, ScheduleResponse, VesselCreate, VesselResponse, CompanyCreate, CompanyResponse, ScheduleDetailResponse
from typing import List
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager



'''
Я (уже не) ОБЕЩАЮ, ЧТО ПРОВЕДУ РЕФАКТОРИНГ И РАЗБИВКУ НА МОДУЛИ, КОГДА СДЕЛАЮ ВСЁ ОСНОВНОЕ.
'''




'''
==== Конфигурация ====
'''
JWT_SECRET = Config.JWT_SECRET
ALGORITHM = "HS256"
scheduler = BackgroundScheduler()
security = HTTPBearer(auto_error=False)

'''
==== Функции ====
'''
# Создаёт таблицу, если отсутствует
Base.metadata.create_all(bind=engine)

# Хеширование пароля
def hash_password(password: str) -> str:
    password_hash = PasswordHash.recommended()
    return password_hash.hash(password)

# Проверка пароля
def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_hash = PasswordHash.recommended()
    return password_hash.verify(plain_password, hashed_password)

# Создание JWT токена
def create_token(user_id: int, username: str, role: str) -> str:
    payload = {"user_id": user_id, 
               "username": username,
               "role": role}
    token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)
    return token

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    if credentials:
        token = credentials.credentials
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            user_id = payload.get("user_id")
            user = db.query(User).filter(User.id == user_id).first()
            return user
        except ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Токен истёк")
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Неверный токен")
    else:
        raise HTTPException(status_code=401, detail="Отсутствует токен")

# Проверяет, что пользователь - агент, директор, админ
def check_admin_role(current_user: User = Depends(get_current_user)):
    """Проверяет, что пользователь - админ"""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=403,
            detail="Доступ запрещён. Требуются права администратора."
        )
    return current_user

def check_agent_role(current_user: User = Depends(get_current_user)):
    """Проверяет, что пользователь - агент"""
    if current_user.role != UserRole.agent:
        raise HTTPException(
            status_code=403,
            detail="Доступ запрещён. Требуются права агента."
        )
    return current_user

def check_director_role(current_user: User = Depends(get_current_user)):
    """Проверяет, что пользователь - директор"""
    if current_user.role != UserRole.director:
        raise HTTPException(
            status_code=403,
            detail="Доступ запрещён. Требуются права директора."
        )
    return current_user

'''
==== Планировщик задач (для очистки старых записей) ====
'''

def cleanup_old_schedules():
    db = SessionLocal()
    deleted_count = 0
    try:
        today = date.today()
        
        deleted_count = db.query(Schedule).filter(
            Schedule.date < today
        ).delete(synchronize_session=False)
        
        db.commit()
        print(f"Cleaning *sweep-sweep*: deleted {deleted_count} old schedules")
    except Exception as e:
        db.rollback()
        print(f"Error while cleaning: {e}")
    finally:
        db.close()
        

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        cleanup_old_schedules,
        trigger=CronTrigger(hour=0, minute=0, timezone="Europe/Moscow"),
        id="cleanup_schedules",
        replace_existing=True  # Защита от дублей при --reload
    )

    scheduler.start()

    yield
    
    scheduler.shutdown()


'''
==== Инициализация FastAPI ====
'''

app = FastAPI(lifespan=lifespan)

'''
==== WEBSOCKET (REAL-TIME) ====
'''

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """Отправляет сообщение всем подключенным клиентам"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        # Удаляем отвалившиеся соединения
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

@app.websocket("/ws/schedule")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Ждем сообщений, чтобы держать соединение открытым
            data = await websocket.receive_text()
    except:
        manager.disconnect(websocket)


'''
==== Начинка сайта ====
'''

app.mount("/static", StaticFiles(directory="static"), name="static")    

@app.get("/")
async def root():
    return FileResponse("static/login.html")

@app.get("/login.html")
async def login():
    return FileResponse("static/login.html")

@app.get("/register.html")
async def register():
    return FileResponse("static/register.html")

@app.get("/dashboard.html")
async def dashboard_page():
    return FileResponse("static/dashboard.html")

@app.get("/admin.html")
async def admin_page():
    return FileResponse("static/admin.html")

@app.get("/schedule.html")
async def schedule_page():
    return FileResponse("static/schedule.html")

'''
 ==== API =====
''' 
@app.post("/api/register")
def register(user_data: dict, db: Session = Depends(get_db)):
    """Регистрация пользователя с привязкой к компании"""
    
    # 1. Проверка email
    existing = db.query(User).filter(User.email == user_data["email"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Аккаунт с такой почтой уже существует")
    
    # 2. Работа с компанией
    company_name = user_data.get("company", "").strip() or "Без компании"
    
    # Ищем существующую компанию
    company = db.query(Company).filter(Company.name == company_name).first()
    
    # Если нет — создаём
    if not company:
        company = Company(name=company_name)
        db.add(company)
        db.commit()  # Чтобы получить company.id
        db.refresh(company)
    
    # 3. Создаём пользователя
    new_user = User(
        username=user_data["username"],
        email=user_data["email"],
        password=hash_password(user_data["password"]),
        telephone_number=user_data.get("telephone_number", "Отсутствует"),
        role=UserRole.viewer,  # По умолчанию - просмотр
        company_id=company.id  
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {
        "message": "Регистрация успешна! Ожидайте подтверждения от директора.", 
        "user_id": new_user.id
    }

# Получение списка компаний для регистрации (выпадающий список)
@app.get("/api/companies", response_model=list[CompanyResponse])
def get_companies(db: Session = Depends(get_db)):
    """Возвращает список всех компаний для регистрации"""
    return db.query(Company).all()

# Вход в систему
@app.post("/api/login")
def login(login_data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data["email"]).first()
    
    if not user or not verify_password(login_data["password"], user.password):
        raise HTTPException(
            status_code=401,
            detail="Неверная почта или пароль"
        )
    
    access_token = create_token(
        user.id, 
        user.username, 
        user.role.value
    )

    return {
        "message": "Вход выполнен", 
        "username": user.username,
        "access_token": access_token,
        "role": user.role.value,
        "email": user.email,
        "UserRole": user.role.value
    }

# Личный кабинет
@app.get("/api/profile")
def profile(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "email": current_user.email,
        "telephone_number": current_user.telephone_number,
        "company": current_user.company,
        "role": current_user.role.value
    }

@app.put("/api/profile")
def update_profile(update_data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if "username" in update_data:
        current_user.username = update_data["username"]
    if "telephone_number" in update_data:
        current_user.telephone_number = update_data["telephone_number"]
    if "company" in update_data:
        current_user.company = update_data["company"]
    
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Профиль обновлён",
        "username": current_user.username,
        "email": current_user.email,
        "telephone_number": current_user.telephone_number,
        "company": current_user.company,
        "role": current_user.role.value
    }

@app.post("/api/logout")
def logout():
    return {"message": "Вы вышли из системы"}

@app.get("/api/dashboard")
async def dashboard(current_user: User = Depends(get_current_user)):
    return FileResponse("static/dashboard.html")

'''
==== Админка ====
'''
# Работа с пользователями
@app.get("/api/admin/users")
async def get_all_users(
    current_user: User = Depends(check_admin_role),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return {
        "count": len(users),
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role.value,
                "telephone_number": user.telephone_number,
                "company": user.company,
                "created_at": user.created_at
            }
            for user in users
        ]
    }

@app.put("/api/admin/users/{user_id}/role")
async def change_user_role(
    user_id: int,
    role_data: dict,
    current_user: User = Depends(check_admin_role),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя изменить свою роль")
    
    new_role = role_data.get("role")
    if new_role not in ["viewer", "agent", "admin", "director"]:
        raise HTTPException(status_code=400, detail="Неверная роль")
    
    user.role = UserRole(new_role)
    db.commit()
    
    return {
        "message": "Роль изменена",
        "user_id": user.id,
        "new_role": new_role
    }

@app.delete("/api/admin/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(check_admin_role),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить себя")
    
    db.delete(user)
    db.commit()
    
    return {
        "message": "Пользователь удалён",
        "user_id": user_id
    }

@app.get("/api/admin/stats")
async def get_stats(
    current_user: User = Depends(check_admin_role),
    db: Session = Depends(get_db)
):
    total_users = db.query(User).count()
    admins = db.query(User).filter(User.role == UserRole.admin).count()
    agents = db.query(User).filter(User.role == UserRole.agent).count()
    viewers = db.query(User).filter(User.role == UserRole.viewer).count()
    directors = db.query(User).filter(User.role == UserRole.director).count()
    
    return {
        "total": total_users,
        "by_role": {
            "admin": admins,
            "agent": agents,
            "viewer": viewers,
            "director": directors
        }
    }

'''
==== Функции для агентов ====
'''

@app.get("/api/vessels", response_model=list[VesselResponse])
def get_my_vessels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Возвращает список судов, принадлежащих текущему агенту"""
    vessels = db.query(Vessel).filter(Vessel.user_id == current_user.id).all()
    return vessels


@app.post("/api/vessels", response_model=VesselResponse)
def create_vessel(
    data: VesselCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Добавляет новое судно в личный список агента"""
    exists = db.query(Vessel).filter(
        Vessel.user_id == current_user.id,
        Vessel.vessel_number == data.vessel_number
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Судно с таким рег. номером уже есть в вашем списке")

    new_vessel = Vessel(**data.model_dump(), user_id=current_user.id)
    db.add(new_vessel)
    db.commit()
    db.refresh(new_vessel)
    return new_vessel

@app.delete("/api/vessels/{vessel_id}")
def delete_vessel(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удаляет судно из личного списка агента (только если оно не забронировано)"""
    vessel = db.query(Vessel).filter(
        Vessel.id == vessel_id,
        Vessel.user_id == current_user.id
    ).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Судно не найдено в вашем списке")

    has_schedule = db.query(Schedule).filter(Schedule.vessel_id == vessel_id, Schedule.date >= date.today()).first()
    if has_schedule:
        raise HTTPException(status_code=400, detail="Нельзя удалить судно, которое есть в расписании")

    db.delete(vessel)
    db.commit()
    return {"message": "Судно удалено"}

'''
==== Расписание ====
'''

@app.get("/api/schedule", response_model=list[ScheduleResponse])
def get_schedule(
    date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        results = db.query(Schedule, Vessel, User).join(
            Vessel, Schedule.vessel_id == Vessel.id
        ).outerjoin(  
            User, Schedule.user_id == User.id
        ).filter(Schedule.date == date).all()

        response_data = []
        for s, v, u in results:  
            try:
                response_data.append({
                    "id": s.id,
                    "vessel_id": s.vessel_id,
                    "date": str(s.date),
                    "hour": s.hour,
                    "berth": s.berth.value if hasattr(s.berth, 'value') else str(s.berth),
                    "status": s.status.value if hasattr(s.status, 'value') else str(s.status),
                    "owner_id": s.user_id,
                    "vessel_name": v.vessel_name if v else None,
                    "owner_username": u.username if u else None,
                    "owner_company": u.company.name if u and u.company else None,
                    "created_at": str(s.created_at) if s.created_at else None
                })
            except Exception as item_error:
                print(f"Error with schedule {s.id}: {item_error}")
                continue
        
        return response_data
        
    except Exception as e:
        print(f"Error in get_schedule: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/schedule")
async def create_schedule_entry(
    data: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.value == "viewer":
        raise HTTPException(status_code=403, detail="Доступ запрещён: требуется роль агента или выше")

    if data.hour not in [2, 5, 11, 14, 17, 20, 23]:
        raise HTTPException(status_code=400, detail="Неверный час")

    vessel = db.query(Vessel).filter(
        Vessel.id == data.vessel_id,
        Vessel.user_id == current_user.id
    ).first()
    if not vessel:
        raise HTTPException(status_code=403, detail="Судно не найдено или не принадлежит вам")

    now = datetime.now()
    today_str = now.date().isoformat()  # "YYYY-MM-DD"
    
    # 1. Запрет на прошедшие даты
    if str(data.date) < today_str:
        raise HTTPException(status_code=400, detail="Нельзя бронировать на прошедшие даты")
        
    # 2. Правила для СЕГОДНЯ
    if str(data.date) == today_str:
        # Нельзя ставить на час, который уже наступил или прошёл
        if data.hour <= now.hour:
            raise HTTPException(status_code=400, detail=f"Слот {data.hour}:00 уже прошёл или наступает сейчас")
            
        # Правило 15:00: после 15:00 доступны только слоты >= 17:00
        if now.time() >= time(15, 0) and data.hour < 17:
            raise HTTPException(
                status_code=403, 
                detail="После 15:00 доступны для бронирования только слоты с 17:00 и позже"
            )

    schedule_data = data.model_dump(exclude={'editing_entry_id', 'editing_entry_date'})
    editing_id = data.editing_entry_id
    editing_date = data.editing_entry_date

    # Проверка конфликта
    conflict_query = db.query(Schedule).filter(
        Schedule.date == data.date,
        Schedule.hour == data.hour,
        Schedule.berth == data.berth
    )
    if editing_id:
        conflict_query = conflict_query.filter(Schedule.id != editing_id)
    
    conflict = conflict_query.first()
    if conflict:
        occupied = db.query(Vessel).filter(Vessel.id == conflict.vessel_id).first()
        raise HTTPException(
            status_code=409,
            detail=f"Конфликт! {data.berth} в {data.hour}:00 уже занят судном '{occupied.vessel_name if occupied else 'Неизвестно'}'"
        )

    new_entry = Schedule(**schedule_data, user_id=current_user.id)
    db.add(new_entry)
    db.flush()

    if editing_id:
        old_entry = db.query(Schedule).filter(
            Schedule.id == editing_id,
            Schedule.user_id == current_user.id
        ).first()
        if old_entry:
            db.delete(old_entry)

    db.commit()
    db.refresh(new_entry)

    #  WebSocket уведомления
    await manager.broadcast({
        "type": "schedule_updated",
        "date": str(data.date)
    })

    if editing_id and editing_date and editing_date != data.date:
        print(f"Sending update for old date: {editing_date}")
        await manager.broadcast({
            "type": "schedule_updated",
            "date": str(editing_date)
        })

    return {"message": "Успешно", "id": new_entry.id}

@app.get("/api/schedule/{entry_id}")
def get_schedule_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entry = db.query(Schedule).filter(Schedule.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    
    vessel = db.query(Vessel).filter(Vessel.id == entry.vessel_id).first()
    owner = db.query(User).filter(User.id == entry.user_id).first()
    
    owner_company = db.query(Company).filter(
        Company.id == owner.company_id
    ).first() if owner and owner.company_id else None
    
    return {
        "id": entry.id,
        "vessel_id": entry.vessel_id,
        "vessel_name": vessel.vessel_name if vessel else "Неизвестно",
        "vessel_number": vessel.vessel_number if vessel else None,
        "date": str(entry.date),
        "hour": entry.hour,
        "berth": entry.berth.value if hasattr(entry.berth, 'value') else str(entry.berth),
        "status": entry.status.value if hasattr(entry.status, 'value') else str(entry.status),
        "owner_id": entry.user_id,
        "owner_username": owner.username if owner else None,  
        "owner_company": owner_company.name if owner_company else None, 
        "created_at": str(entry.created_at) if entry.created_at else None
    }

@app.delete("/api/schedule/{entry_id}")
async def delete_schedule_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    
    entry = db.query(Schedule).filter(
        Schedule.id == entry_id,
        Schedule.user_id == current_user.id
    ).first()
    # Он меня достал, поэтому лови костыль   
    if not entry:
        return {"message": "Запись уже удалена или не найдена", "status": "skipped"}
    
    entry_date = str(entry.date)
    db.delete(entry)
    db.commit()
    
    await manager.broadcast({
        "type": "schedule_updated",
        "date": entry_date
    })
    
    return {"message": "Запись удалена", "status": "deleted"}

'''
==== Запрос времени для машины ====
'''
@app.get("/api/server-time")
async def get_server_time():
    from datetime import datetime
    now = datetime.now()
    return {
        "date": now.strftime("%Y-%m-%d"), 
        "hour": now.hour,
        "minute": now.minute
    }