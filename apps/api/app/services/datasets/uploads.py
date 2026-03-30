from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from uuid import uuid4
from xml.etree import ElementTree

from app.schemas.dataset import DatasetField, DatasetSummary
from app.services.datasets.catalog import register_dataset

_API_ROOT = Path(__file__).resolve().parents[3]
_UPLOADS_DIR = _API_ROOT / ".tmp" / "uploads"
_SUPPORTED_FILE_TYPES = {
    ".csv": "csv",
    ".tsv": "tsv",
    ".json": "json",
    ".xml": "xml",
    ".sqlite": "sqlite",
    ".sqlite3": "sqlite",
    ".db": "sqlite",
}
_SUPPORTED_CONTENT_TYPES = {
    "application/csv": "csv",
    "text/csv": "csv",
    "text/tab-separated-values": "tsv",
    "application/json": "json",
    "text/json": "json",
    "application/xml": "xml",
    "text/xml": "xml",
    "application/vnd.sqlite3": "sqlite",
    "application/x-sqlite3": "sqlite",
}
_NUMERIC_TYPES = {"INTEGER", "DOUBLE", "DECIMAL", "FLOAT", "REAL", "BIGINT"}


@dataclass(slots=True)
class ColumnSpec:
    source_name: str
    output_name: str
    display_name: str
    declared_type: str | None = None


@dataclass(slots=True)
class ColumnProfiler:
    declared_type: str | None = None
    example_values: list[str] = field(default_factory=list)
    seen_non_empty: bool = False
    matches_boolean: bool = True
    matches_integer: bool = True
    matches_double: bool = True
    matches_date: bool = True

    def observe(self, value: object) -> None:
        if value is None:
            return

        serialized = _serialize_cell(value)
        normalized = serialized.strip()
        if normalized == "":
            return

        self.seen_non_empty = True
        if normalized not in self.example_values and len(self.example_values) < 2:
            self.example_values.append(normalized)

        if not _looks_boolean(value):
            self.matches_boolean = False
        if not _looks_integer(value):
            self.matches_integer = False
        if not _looks_double(value):
            self.matches_double = False
        if not _looks_date(value):
            self.matches_date = False

    def inferred_type(self) -> str:
        if self.seen_non_empty:
            if self.matches_boolean:
                return "BOOLEAN"
            if self.matches_integer:
                return "INTEGER"
            if self.matches_double:
                return "DOUBLE"
            if self.matches_date:
                return "DATE"

        if self.declared_type:
            return _map_declared_type(self.declared_type)

        return "TEXT"


def register_uploaded_file(
    *, file_name: str, content: bytes, content_type: str | None = None
) -> list[DatasetSummary]:
    normalized_name = Path(file_name).name.strip()
    if not normalized_name:
        raise ValueError("Uploaded files must include a filename.")
    if not content:
        raise ValueError("Uploaded files cannot be empty.")

    file_type = _detect_file_type(file_name=normalized_name, content_type=content_type)
    if file_type is None:
        raise ValueError(
            "Unsupported file type. Upload a CSV, TSV, JSON, XML, or SQLite file."
        )

    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    import_id = _build_import_id(normalized_name)
    import_dir = _UPLOADS_DIR

    if file_type == "csv":
        return [
            _import_delimited_file(
                file_name=normalized_name,
                content=content,
                delimiter=",",
                dataset_id=import_id,
                import_dir=import_dir,
            )
        ]

    if file_type == "tsv":
        return [
            _import_delimited_file(
                file_name=normalized_name,
                content=content,
                delimiter="\t",
                dataset_id=import_id,
                import_dir=import_dir,
            )
        ]

    if file_type == "json":
        return [
            _import_record_file(
                file_name=normalized_name,
                records=_extract_json_records(content),
                dataset_id=import_id,
                import_dir=import_dir,
                description=(
                    f"Imported from uploaded JSON file '{normalized_name}'."
                ),
            )
        ]

    if file_type == "xml":
        return [
            _import_record_file(
                file_name=normalized_name,
                records=_extract_xml_records(content),
                dataset_id=import_id,
                import_dir=import_dir,
                description=f"Imported from uploaded XML file '{normalized_name}'.",
            )
        ]

    if file_type == "sqlite":
        suffix = Path(normalized_name).suffix or ".sqlite"
        source_path = import_dir / f"{import_id}_source{suffix}"
        source_path.write_bytes(content)
        return _import_sqlite_database(
            file_name=normalized_name,
            dataset_prefix=import_id,
            import_dir=import_dir,
            source_path=source_path,
        )

    raise ValueError("Unsupported file type.")


def _import_delimited_file(
    *,
    file_name: str,
    content: bytes,
    delimiter: str,
    dataset_id: str,
    import_dir: Path,
) -> DatasetSummary:
    text = _decode_text(content)
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    header_row = next(reader, None)
    if header_row is None:
        raise ValueError("Uploaded file is empty.")
    if not any(str(header).strip() for header in header_row):
        raise ValueError("Uploaded delimited files must include a header row.")

    column_specs = _build_column_specs(header_row)
    output_path = import_dir / f"{dataset_id}.csv"
    label = Path(file_name).stem or "Uploaded dataset"
    description = f"Imported from uploaded file '{file_name}'."

    def rows() -> Iterable[Sequence[object]]:
        for row in reader:
            normalized_row = list(row[: len(column_specs)])
            if len(normalized_row) < len(column_specs):
                normalized_row.extend("" for _ in range(len(column_specs) - len(normalized_row)))
            yield normalized_row

    return _materialize_dataset(
        dataset_id=dataset_id,
        label=label,
        description=description,
        column_specs=column_specs,
        rows=rows(),
        output_path=output_path,
    )


def _import_record_file(
    *,
    file_name: str,
    records: list[dict[str, object]],
    dataset_id: str,
    import_dir: Path,
    description: str,
) -> DatasetSummary:
    if len(records) == 0:
        raise ValueError("Uploaded data did not contain any tabular records.")

    column_names = _collect_record_keys(records)
    column_specs = _build_column_specs(column_names)
    output_path = import_dir / f"{dataset_id}.csv"

    def rows() -> Iterable[Sequence[object]]:
        for record in records:
            yield [record.get(name) for name in column_names]

    return _materialize_dataset(
        dataset_id=dataset_id,
        label=Path(file_name).stem or "Uploaded dataset",
        description=description,
        column_specs=column_specs,
        rows=rows(),
        output_path=output_path,
    )


def _import_sqlite_database(
    *,
    file_name: str,
    dataset_prefix: str,
    import_dir: Path,
    source_path: Path,
) -> list[DatasetSummary]:
    try:
        connection = sqlite3.connect(str(source_path))
    except sqlite3.Error as exc:
        raise ValueError("Uploaded SQLite files could not be opened.") from exc
    try:
        table_names = [
            str(row[0])
            for row in connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            ).fetchall()
        ]
        if len(table_names) == 0:
            raise ValueError("Uploaded SQLite databases must contain at least one table.")

        imported: list[DatasetSummary] = []
        for table_name in table_names:
            try:
                table_info = connection.execute(
                    f"PRAGMA table_info({_quote_sqlite_identifier(table_name)})"
                ).fetchall()
            except sqlite3.Error as exc:
                raise ValueError(
                    f"Failed to inspect table '{table_name}' in the uploaded SQLite database."
                ) from exc
            column_names = [str(column[1]) for column in table_info]
            declared_types = {
                str(column[1]): str(column[2] or "")
                for column in table_info
            }
            if len(column_names) == 0:
                continue

            column_specs = _build_column_specs(column_names, declared_types=declared_types)
            dataset_id = f"{dataset_prefix}_{_slugify(table_name)}"
            output_path = import_dir / f"{dataset_id}.csv"
            try:
                cursor = connection.execute(
                    f"SELECT * FROM {_quote_sqlite_identifier(table_name)}"
                )
            except sqlite3.Error as exc:
                raise ValueError(
                    f"Failed to read table '{table_name}' from the uploaded SQLite database."
                ) from exc

            imported.append(
                _materialize_dataset(
                    dataset_id=dataset_id,
                    label=f"{table_name} ({Path(file_name).name})",
                    description=(
                        f"Imported from table '{table_name}' in uploaded SQLite database "
                        f"'{file_name}'."
                    ),
                    column_specs=column_specs,
                    rows=_iter_sqlite_rows(cursor),
                    output_path=output_path,
                )
            )

        if len(imported) == 0:
            raise ValueError("Uploaded SQLite databases did not expose any readable tables.")

        return imported
    except sqlite3.Error as exc:
        raise ValueError("Uploaded SQLite files could not be read.") from exc
    finally:
        connection.close()


def _materialize_dataset(
    *,
    dataset_id: str,
    label: str,
    description: str,
    column_specs: list[ColumnSpec],
    rows: Iterable[Sequence[object]],
    output_path: Path,
) -> DatasetSummary:
    profilers = [ColumnProfiler(declared_type=column.declared_type) for column in column_specs]
    row_count = 0

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([column.output_name for column in column_specs])

        for row in rows:
            serialized_row = [_serialize_cell(value) for value in row]
            if len(serialized_row) < len(column_specs):
                serialized_row.extend("" for _ in range(len(column_specs) - len(serialized_row)))
            elif len(serialized_row) > len(column_specs):
                serialized_row = serialized_row[: len(column_specs)]

            if all(value.strip() == "" for value in serialized_row):
                continue

            writer.writerow(serialized_row)
            row_count += 1

            for profiler, value in zip(profilers, row, strict=False):
                profiler.observe(value)

    schema_fields = [
        DatasetField(
            name=column.output_name,
            type=profiler.inferred_type(),
            description=_build_column_description(column),
            example_values=profiler.example_values,
        )
        for column, profiler in zip(column_specs, profilers, strict=True)
    ]
    summary = DatasetSummary(
        dataset_id=dataset_id,
        label=label,
        description=description,
        row_count=row_count,
        capabilities=_build_capabilities(schema_fields),
        example_prompts=_build_example_prompts(
            schema_fields=schema_fields,
            display_names={column.output_name: column.display_name for column in column_specs},
        ),
        schema=schema_fields,
    )
    return register_dataset(summary=summary, file_path=output_path)


def _extract_json_records(content: bytes) -> list[dict[str, object]]:
    try:
        payload = json.loads(_decode_text(content))
    except json.JSONDecodeError as exc:
        raise ValueError("Uploaded JSON files must contain valid JSON.") from exc

    if isinstance(payload, list):
        return [_normalize_record(item) for item in payload]

    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                return [_normalize_record(item) for item in value]
        return [_normalize_record(payload)]

    return [{"value": payload}]


def _extract_xml_records(content: bytes) -> list[dict[str, object]]:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise ValueError("Uploaded XML files must contain valid XML.") from exc
    record_elements = _find_xml_record_elements(root)
    return [_normalize_record(_xml_element_to_mapping(element)) for element in record_elements]


def _find_xml_record_elements(root: ElementTree.Element) -> list[ElementTree.Element]:
    root_children = list(root)
    if _has_repeated_tag_group(root_children):
        return root_children

    for node in root.iter():
        children = list(node)
        if _has_repeated_tag_group(children):
            return children

    if root_children:
        return [root]

    return [root]


def _xml_element_to_mapping(element: ElementTree.Element) -> dict[str, object]:
    children = list(element)
    if not children:
        text = (element.text or "").strip()
        record: dict[str, object] = {}
        if element.attrib:
            for attribute_name, attribute_value in element.attrib.items():
                record[f"attr_{attribute_name}"] = attribute_value
        if text:
            if record:
                record["value"] = text
                return record
            return {"value": text}
        return record or {"value": ""}

    record: dict[str, object] = {}
    for attribute_name, attribute_value in element.attrib.items():
        record[f"attr_{attribute_name}"] = attribute_value

    for child in children:
        child_value = _xml_element_value(child)
        existing_value = record.get(child.tag)
        if existing_value is None:
            record[child.tag] = child_value
            continue

        if isinstance(existing_value, list):
            existing_value.append(child_value)
            continue

        record[child.tag] = [existing_value, child_value]

    return record


def _xml_element_value(element: ElementTree.Element) -> object:
    children = list(element)
    if not children:
        text = (element.text or "").strip()
        if element.attrib:
            result = {f"attr_{name}": value for name, value in element.attrib.items()}
            if text:
                result["value"] = text
            return result
        return text

    return _xml_element_to_mapping(element)


def _normalize_record(value: object) -> dict[str, object]:
    if isinstance(value, Mapping):
        return {str(key): nested_value for key, nested_value in value.items()}
    return {"value": value}


def _collect_record_keys(records: list[dict[str, object]]) -> list[str]:
    ordered_keys: list[str] = []
    seen_keys: set[str] = set()
    for record in records:
        for key in record:
            if key in seen_keys:
                continue
            seen_keys.add(key)
            ordered_keys.append(key)

    return ordered_keys or ["value"]


def _build_column_specs(
    raw_names: Sequence[str],
    *,
    declared_types: Mapping[str, str] | None = None,
) -> list[ColumnSpec]:
    used_names: set[str] = set()
    column_specs: list[ColumnSpec] = []

    for index, raw_name in enumerate(raw_names, start=1):
        display_name = str(raw_name).strip() or f"column {index}"
        output_name = _sanitize_identifier(display_name, used_names)
        declared_type = None
        if declared_types is not None:
            declared_type = declared_types.get(str(raw_name))

        column_specs.append(
            ColumnSpec(
                source_name=str(raw_name),
                output_name=output_name,
                display_name=display_name,
                declared_type=declared_type,
            )
        )

    return column_specs


def _build_capabilities(schema_fields: list[DatasetField]) -> list[str]:
    capabilities = ["count"]
    if any(field.type.upper() in _NUMERIC_TYPES for field in schema_fields):
        capabilities.extend(["sum", "avg"])
    return capabilities


def _build_example_prompts(
    *,
    schema_fields: list[DatasetField],
    display_names: Mapping[str, str],
) -> list[str]:
    prompts = ["How many rows are there?"]

    numeric_field = next(
        (field for field in schema_fields if field.type.upper() in _NUMERIC_TYPES),
        None,
    )
    if numeric_field is not None:
        display_name = display_names.get(numeric_field.name, numeric_field.name)
        prompts.append(f"What is the total {display_name}?")
        prompts.append(f"What is the average {display_name}?")

    filter_field = next(
        (field for field in schema_fields if len(field.example_values) > 0),
        None,
    )
    if filter_field is not None:
        display_name = display_names.get(filter_field.name, filter_field.name)
        example_value = filter_field.example_values[0]
        if filter_field.type.upper() == "BOOLEAN":
            prompts.append(f"How many rows have {display_name} set to {example_value}?")
        else:
            prompts.append(f"How many rows have {display_name} equal to {example_value}?")

    deduped_prompts: list[str] = []
    for prompt in prompts:
        if prompt in deduped_prompts:
            continue
        deduped_prompts.append(prompt)

    return deduped_prompts[:4]


def _build_column_description(column: ColumnSpec) -> str:
    if column.display_name != column.output_name:
        return (
            f"Uploaded column '{column.display_name}' normalized to "
            f"'{column.output_name}'."
        )
    return f"Uploaded column '{column.display_name}'."


def _detect_file_type(file_name: str, content_type: str | None) -> str | None:
    suffix = Path(file_name).suffix.lower()
    if suffix in _SUPPORTED_FILE_TYPES:
        return _SUPPORTED_FILE_TYPES[suffix]

    if content_type is None:
        return None

    normalized_content_type = content_type.split(";", 1)[0].strip().lower()
    return _SUPPORTED_CONTENT_TYPES.get(normalized_content_type)


def _build_import_id(file_name: str) -> str:
    stem = Path(file_name).stem or "dataset"
    return f"upload_{_slugify(stem)}_{uuid4().hex[:8]}"


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    if not cleaned:
        return "dataset"
    if cleaned[0].isdigit():
        return f"dataset_{cleaned}"
    return cleaned


def _sanitize_identifier(value: str, used_names: set[str]) -> str:
    base_name = _slugify(value)
    candidate = base_name
    suffix = 2
    while candidate in used_names:
        candidate = f"{base_name}_{suffix}"
        suffix += 1
    used_names.add(candidate)
    return candidate


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("The uploaded file could not be decoded as text.")


def _iter_sqlite_rows(cursor: sqlite3.Cursor) -> Iterable[Sequence[object]]:
    while True:
        batch = cursor.fetchmany(1000)
        if len(batch) == 0:
            return
        for row in batch:
            yield tuple(row)


def _serialize_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (dict, list, tuple, set)):
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    return str(value)


def _looks_boolean(value: object) -> bool:
    if isinstance(value, bool):
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"true", "false", "yes", "no"}
    return False


def _looks_integer(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return value.is_integer()
    if isinstance(value, str):
        return re.fullmatch(r"[+-]?\d+", value.strip()) is not None
    return False


def _looks_double(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        try:
            float(value.strip())
            return True
        except ValueError:
            return False
    return False


def _looks_date(value: object) -> bool:
    if isinstance(value, datetime):
        return False
    if isinstance(value, date):
        return True
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value.strip())
        return True
    except ValueError:
        return False


def _map_declared_type(declared_type: str) -> str:
    normalized = declared_type.upper()
    if "BOOL" in normalized:
        return "BOOLEAN"
    if "INT" in normalized:
        return "INTEGER"
    if any(token in normalized for token in ("REAL", "FLOA", "DOUB", "DEC", "NUM")):
        return "DOUBLE"
    if "DATE" in normalized or "TIME" in normalized:
        return "DATE"
    return "TEXT"


def _has_repeated_tag_group(elements: Sequence[ElementTree.Element]) -> bool:
    if len(elements) < 2:
        return False
    counts: dict[str, int] = {}
    for element in elements:
        counts[element.tag] = counts.get(element.tag, 0) + 1
        if counts[element.tag] >= 2:
            return True
    return False


def _quote_sqlite_identifier(value: str) -> str:
    escaped = value.replace('"', '""')
    return f'"{escaped}"'
