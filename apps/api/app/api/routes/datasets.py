from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.dataset import DatasetListResponse
from app.services.datasets.catalog import list_datasets
from app.services.datasets.uploads import register_uploaded_file

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=DatasetListResponse)
async def get_datasets() -> DatasetListResponse:
    return DatasetListResponse(items=list_datasets())


@router.post("/upload", response_model=DatasetListResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(request: Request) -> DatasetListResponse:
    encoded_file_name = request.headers.get("x-file-name")
    if encoded_file_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-File-Name header.",
        )

    file_name = unquote(encoded_file_name).strip()
    if file_name == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded files must include a filename.",
        )

    payload = await request.body()

    try:
        items = register_uploaded_file(
            file_name=file_name,
            content=payload,
            content_type=request.headers.get("content-type"),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return DatasetListResponse(items=items)
