# Понятное дело - библиотеки
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db, Base, engine
from models import User, UserRole
from pwdlib import PasswordHash


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

'''
 ==== API =====
''' 
# Проверка кол-ва пользователей в базе данных
@app.get("/api/test")
async def test(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return {"message": "Test successful!", "users": users}

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

app.post("/api/login")
def login(login_data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data["email"]).first()
    
    if not user or not verify_password(login_data["password"], user.password):
        raise HTTPException(
            status_code=401,
            detail="Неверная почта или пароль"
        )
    
    return {
        "message": "Вход выполнен", 
        "username": user.username
    }