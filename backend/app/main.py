import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.upload import router as upload_router
from app.api.routes.profile import router as profile_router
from app.api.routes.analysis import router as analysis_router
from app.api.routes.llm import router as llm_router
from app.api.routes.suggestions import router as suggestions_router
from app.api.routes.data_readiness import router as data_readiness_router

app = FastAPI(title="CausalLab API")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(profile_router)
app.include_router(suggestions_router)
app.include_router(data_readiness_router)
app.include_router(analysis_router)
app.include_router(llm_router)


@app.get("/")
def health_check():
    return {"message": "CausalLab API is running"}