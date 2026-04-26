from sqlalchemy import Column, Integer, String, TIMESTAMP, Enum, ForeignKey, Date, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import enum

'''
===== Перечисления (Enums) =====
'''

class UserRole(enum.Enum):
    viewer = "viewer"
    agent = "agent"
    director = "director"
    admin = "admin"

class ScheduleStatus(str, enum.Enum):
    unset = "Не задано"
    mooring = "Швартовка"
    unmooring = "Отшвартовка"
    raid = "Рейд"

class BerthNumber(str, enum.Enum):
    unset = "Не задано"
    berth1 = "Причал №1"
    berth2 = "Причал №2"
    berth3 = "Причал №3"
    berth4 = "Причал №4"
    berth5 = "Причал №5"

'''
===== Модели данных (SQLAlchemy Models) =====
'''

class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # Связь: У компании много пользователей
    users = relationship("User", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(60), unique=False, nullable=False)
    telephone_number = Column(String(11), nullable=False, default="Отсутствует")
    email = Column(String(100), unique=True, nullable=False)  # ✅ Добавил unique=True для корректного входа
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.viewer)
    
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)
    
    
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Связи
    vessels = relationship("Vessel", back_populates="owner", cascade="all, delete-orphan")
    schedule_entries = relationship("Schedule", back_populates="user", cascade="all, delete-orphan")
    company = relationship("Company", back_populates="users")


class Vessel(Base):
    __tablename__ = "vessels"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vessel_name = Column(String(100), nullable=False, index=True)
    vessel_number = Column(String(50), nullable=False)

    # Связь
    owner = relationship("User", back_populates="vessels")


class Schedule(Base):
    __tablename__ = "schedule"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    hour = Column(Integer, nullable=False, index=True)
    status = Column(Enum(ScheduleStatus, values_callable=lambda obj: [e.value for e in obj]), default=ScheduleStatus.unset, nullable=False)
    berth = Column(Enum(BerthNumber, values_callable=lambda obj: [e.value for e in obj]), default=BerthNumber.unset, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User", back_populates="schedule_entries")
    vessel = relationship("Vessel")