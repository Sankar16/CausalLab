from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.upload import router as upload_router
from app.api.routes.profile import router as profile_router
from app.api.routes.analysis import router as analysis_router

app = FastAPI(title="CausalLab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(profile_router)
app.include_router(analysis_router)


@app.get("/")
def health_check():
    return {"message": "CausalLab API is running"}