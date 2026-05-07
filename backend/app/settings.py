from pydantic_settings import BaseSettings
from pydantic import Field
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    database_url: str
    cors_origins: str = "http://localhost:3000"

    jwt_exp_seconds: int = Field(default=60 * 60, validation_alias="JWT_EXP_SECONDS")
    jwt_default_alg: str = Field(default="ES256", validation_alias="JWT_DEFAULT_ALG")
    jwt_keys_json: str = Field(validation_alias="JWT_KEYS_JSON")

    class Config:
        env_prefix = ""
        case_sensitive = False

settings = Settings()