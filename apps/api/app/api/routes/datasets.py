from fastapi import APIRouter

from app.schemas.dataset import DatasetListResponse
from app.services.datasets.catalog import list_datasets

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=DatasetListResponse)
async def get_datasets() -> DatasetListResponse:
    return DatasetListResponse(items=list_datasets())
