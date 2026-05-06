from pydantic import BaseModel, Field, EmailStr
from datetime import date as dt, datetime
from typing import Optional

# ===== Схемы для судов (Vessel) =====
class VesselCreate(BaseModel):
    vessel_name: str = Field(..., min_length=2, max_length=100)
    vessel_number: str = Field(..., min_length=2, max_length=50)

class VesselResponse(BaseModel):
    id: int
    vessel_name: str
    vessel_number: str
    user_id: int  
    
    class Config:
        from_attributes = True

# ===== Схемы для пользователей (User) =====
class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[EmailStr] = None
    role: str  
    telephone_number: Optional[str] = None
    created_at: Optional[datetime] = None

# ===== Схемы для компаний (Company) =====
class CompanyResponse(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

# ===== Схемы для расписания (Schedule) =====
class ScheduleCreate(BaseModel):
    vessel_id: int = Field(..., ge=1)
    date: dt = Field(..., description="Дата YYYY-MM-DD")
    hour: int = Field(..., ge=0, le=23)
    berth: str = Field(...)
    status: str = Field(...)

    editing_entry_id: Optional[int] = None
    editing_entry_date: Optional[str] = None


class ScheduleResponse(BaseModel):
    """Краткая информация для ячеек таблицы"""
    id: int
    vessel_id: int
    date: dt
    hour: int
    berth: str
    status: str
    owner_id: int
    
    vessel_name: Optional[str] = None
    vessel_number: Optional[str] = None
    owner_username: Optional[str] = None
    owner_company: Optional[str] = None 
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ScheduleDetailResponse(BaseModel):
    """Полная информация для модального окна просмотра"""
    id: int
    vessel_id: int
    date: dt
    hour: int
    berth: str
    status: str
    
    vessel_name: str
    vessel_number: Optional[str] = None
    
    owner_id: int
    owner_username: Optional[str] = None  
    owner_company: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        