from pydantic import BaseModel, Field
from datetime import date as dt, datetime  
from typing import Optional

# ==========================================
# 1. СХЕМЫ ДЛЯ СУДОВ (Vessels)
# ==========================================

class VesselCreate(BaseModel):
    vessel_name: str = Field(..., min_length=2, max_length=100)
    vessel_number: str = Field(..., min_length=2, max_length=50)

class VesselResponse(BaseModel):
    id: int
    vessel_name: str
    vessel_number: str

    class Config:
        from_attributes = True


# ==========================================
# 2. СХЕМЫ ДЛЯ РАСПИСАНИЯ (Schedule)
# ==========================================

class ScheduleCreate(BaseModel):
    vessel_id: int = Field(..., ge=1)
    date: dt = Field(..., description="Дата YYYY-MM-DD")  # ✅ Было target_date
    hour: int = Field(..., ge=0, le=23)
    berth: str = Field(...)
    status: str = Field(...)

    class Config:
        from_attributes = True

class ScheduleResponse(BaseModel):
    id: int
    vessel_id: int
    date: dt  
    hour: int
    berth: str
    status: str
    owner_id: int
    vessel_name: Optional[str] = None
    created_at: Optional[datetime] = None  

    class Config:
        from_attributes = True