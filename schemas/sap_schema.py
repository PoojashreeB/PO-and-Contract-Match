from pydantic import BaseModel


class SapConfig(BaseModel):
    ashost: str
    sysnr: str
    client: str
    username: str
    password: str
    # Only needed when the application server name doesn't resolve on this
    # machine: connect to the gateway directly and let it reach the server.
    gwhost: str = ""
    gwserv: str = ""
