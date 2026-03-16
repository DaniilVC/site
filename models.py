from sqlalchemy import Column, Integer, String, TIMESTAMP, Enum
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(enum.Enum):
    viewer = "viewer"
    agent = "agent"
    director = "director"
    admin = "admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(60), unique=True, nullable=False)
    telephone_number = Column(String(11), nullable=False, default="Отсутствует")
    email = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.viewer)
    company = Column(String(100), default="Без компании")
    created_at = Column(TIMESTAMP, server_default=func.now())