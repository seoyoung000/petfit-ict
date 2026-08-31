from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    device_token = Column(String, nullable=True)  # FCM/APNs token
    platform = Column(String, nullable=True)  # ios / android

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    pets = relationship("Pet", back_populates="owner", cascade="all, delete-orphan")
