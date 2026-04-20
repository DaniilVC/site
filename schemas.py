from pydantic import BaseModel
from datetime import date
from typing import Optional

# Схема для создания записи в расписании
class ScheduleCreate(BaseModel):
    vessel_id: int
    date: date
    hour: int
    berth: str       
    status: str      

# Схема для ответа, то, шо идёт во фронтенд
class ScheduleResponse(BaseModel):
    id: int
    vessel_id: int
    date: date
    hour: int
    berth: str
    status: str
    created_at: str

    class Config:
        from_attributes = True