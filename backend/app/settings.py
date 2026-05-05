from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    cors_origins: str = "http://localhost:3000"

    class Config:
        env_prefix = ""
        case_sensitive = False

settings = Settings()