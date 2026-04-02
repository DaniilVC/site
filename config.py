import os
from dotenv import load_dotenv

load_dotenv()

# configuring connection 4 db
class Config:
    DB_HOST = os.getenv('DB_HOST')
    DB_NAME = os.getenv('DB_NAME')
    DB_USER = os.getenv('DB_USER')
    DB_PORT = os.getenv('DB_PORT')
    DB_PASSWORD = os.getenv('DB_PASSWORD')

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT ключ
    JWT_SECRET = os.getenv('JWT_SECRET')