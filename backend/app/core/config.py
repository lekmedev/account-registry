"""Central config. All settings come from environment / .env (pydantic-settings)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "account-registry"
    core_version: str = "1.0.0"
    database_url: str = (
        "postgresql+psycopg2://registry:registry_dev_only@localhost:5433/account_registry"
    )
    jwt_secret_key: str = "dev_only_change_me_32_chars_minimum"
    jwt_access_minutes: int = 30
    jwt_refresh_days: int = 7
    plugins_dir: str = ""  # empty = <repo>/plugins (next to backend/)


settings = Settings()
