from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Clinivue"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "postgresql://postgres:password@localhost/medassist"
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str | None = None

    class Config:
        env_file = ".env"

settings = Settings()
