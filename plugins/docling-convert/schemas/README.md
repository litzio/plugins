# Pinned response schemas

Generated from public APIs, not Litzio internals. These files are part of the standalone plugin artifact. No runtime download or schema default insertion occurs.

- docling-serve 1.38.2 `/openapi.json`: TaskStatusResponse/ConvertDocumentResponse and their referenced definitions → server-responses.json.
- docling-core 2.104.0 public `DoclingDocument.model_json_schema()` → docling-document.json. `TableData.model_json_schema(mode="serialization")` supplies the computed grid property of actual output.
- Offline contract overlay: root schema_name/version/name/origin/body/furniture/groups/texts/pictures/tables/key_value_items/form_items/pages; node parent/children/prov; page/picture image; table data collections/dimensions. Protocol requires task_id/task_type/task_status, full recorded result envelope, wrapper filename/json_content. Supported schema/version and task_type are pinned. Object shapes without an upstream explicit extensible-map policy reject additional fields.
- optional-fields.json lists the remaining named optional fields by schema location. Its reason describes dynamic-map entries. Optional means omission is allowed, never that an invalid supplied value is accepted. Unknown arbitrary metadata map values remain arbitrary only where the upstream schema explicitly permits them.

The interpreter implements the assertion keywords used by these files. Upstream title/description/examples/default/discriminator/readOnly are annotations; `default` is never evaluated. URI/path formats follow the public model's alternatives; the offline image decoder further requires embedded supported PNG bytes. Model JSON Schema does not encode all Pydantic custom validators, so source identity, reference relationships, exact page coverage and decoding remain explicit checks in the same completion decision.

Public upstream sources and licensing:

- https://github.com/docling-project/docling-serve/tree/v1.38.2
- https://github.com/docling-project/docling-core/tree/v2.104.0
- Included LICENSE.docling-serve and LICENSE.docling-core retain the upstream license notices.
