from pydantic import BaseModel


class SapConfig(BaseModel):
    base_url: str
    client: str
    username: str
    password: str
    verify_tls: bool = True
