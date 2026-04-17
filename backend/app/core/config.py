from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "MedAssist AI"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "postgresql://postgres:password@localhost/medassist"
    GEMINI_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
