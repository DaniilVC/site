# Понятное дело - библиотеки
from fastapi import FastAPI, Depends, HTTPException
from config import Config
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db, Base, engine
from models import User, UserRole
from pwdlib import PasswordHash
from datetime import datetime, timedelta
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

'''
==== Конфигурация ====
'''
JWT_SECRET = Config.JWT_SECRET
ALGORITHM = "HS256"

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

'''
==== Начинка сайта ====
'''

app = FastAPI()
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

'''
 ==== API =====
''' 
# Регистрация нового пользователя
@app.post("/api/register")
def register(user_data: dict, db: Session = Depends(get_db)):
    print("Пароль: ", user_data["password"])
    existing = db.query(User).filter(
        (User.email == user_data["email"])
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Аккаунт с такой почтой уже существует"
        )
    
    new_user = User(
        username=user_data["username"],
        email=user_data["email"],
        password=hash_password(user_data["password"]),
        telephone_number=user_data.get("telephone_number", "Отсутствует"),
        role=UserRole.viewer,
        company=user_data.get("company", "Без компании")
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "Регистрация успешна!", 
        "user_id": new_user.id
    }

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