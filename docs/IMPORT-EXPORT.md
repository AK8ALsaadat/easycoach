# Complete coaching import and export

## Workflow and safety

From Clients, open **Import file**. Upload `.xlsx` or UTF-8 `.csv`; inspect every worksheet, choose its category, review detected fields and map columns manually where necessary. Preview is paginated in groups of 50. Validation and unmapped-column warnings refer to original worksheet row numbers. Download CSV/JSON reports for corrections.

Existing clients are matched by normalized email within the current trainer account. The default skips existing personal details while still allowing new dated history for that known client. Explicit merge updates mapped contact/details fields; an omitted phone column preserves the old phone. Duplicate identity rows inside the workbook are errors. No cross-trainer matching occurs.

Invalid rows prevent the import unless **skip invalid rows** is explicitly selected. Unmapped columns require mapping or an explicit ignore choice. A skipped worksheet is an explicit choice as well. Unknown clients in history sheets require a valid Clients row or an existing active client. Archived clients must be restored before import.

Each accepted batch is one database transaction: an error rolls back the batch. Source keys prevent repeated historical rows; the same key with changed payload/date causes a conflict and requires a separately identified correction. A whole-file fingerprint makes exact replay idempotent. Import never publishes a program or replaces an existing program draft implicitly.

Undo is offered for nonfinancial batches. It verifies every changed row still matches its imported state and refuses to overwrite later edits or delete a client with subsequent activity. Template metadata is checked too. Financial batches keep their immutable ledger and cannot be deleted by undo; use the existing documented payment-reversal flow.

## Categories and fields

English field identifiers below also appear in the mapping UI with Arabic labels. Common Arabic/English aliases are detected; every column can be mapped manually.

| Worksheet category | Fields |
| --- | --- |
| Clients | `name`, `email`, optional `phone`, `birth_date`, `age`, `gender`, `height`, `start_date`, `status` |
| Measurements / Weights | `email`, `date`, `source_key`, `weight`, `body_fat`, `bmi`, `waist`, `chest`, `arm`, `thigh`, `hips`, `notes`, `historical_only`, and numeric columns prefixed `custom:` |
| NutritionTargets | `email`, `date`, `source_key`, `calories`, `protein`, `carbs`, `fat`, `text`, optional `meals_json` |
| NutritionLogs | `email`, `date`, `source_key`, `calories`, `protein`, `carbs`, `fat`, `notes` |
| Workouts | `email`, `date`, `source_key`, `day_name`, `completed`, `exercise_name`, `sets`, `reps`, `weight`, `rpe`, `rir`, `notes` |
| Programs / Templates | `email` for client history; `date`, `program_ref`, `program_name`, `day_name`, `weekday`, `exercise_name`, `sets`, `reps`, `rest`, `weight`, `rpe`, `rir`, `tempo`, `video`, `catalog_id`, `notes`; nutrition fields above, or complete validated `content_json`. Templates also accept `description`, `template_kind`, `archived`. |
| Checkins | `email`, `date`, `source_key`, optional `weight`, required `sleep`, `energy`, `hunger`, `stress`, `training_adherence`, `nutrition_adherence`; `feedback`, `questions`, `reviewed`, `coach_feedback`, `photo_ids_json` |
| Goals | `email`, `date`, `source_key`, `goal`, `focus`, `target_weight`, `notes` |
| Notes / Messages | `email`, `date`, `source_key`, `text`; messages may preserve `author_type` (`coach` / `client`) |
| Subscriptions | `email`, `subscription_ref`, `name`, `start_date`, `end_date`, `price` |
| Payments | `email`, `date`, `source_key`, `subscription_ref`, `amount`, `method`, `reference`; ordinary payments only |

Personal status values: `active`, `inactive`, `new` (Arabic equivalents are detected). Gender: `male`, `female`, `other`, `unspecified`. Numeric Arabic/Persian digits and Arabic decimal separators are supported. Dates accept ISO `YYYY-MM-DD`, real Excel dates/serials, and day/month/year or month/day/year according to the explicit preview setting. Invalid dates are errors; no historical activity date is invented.

A Clients sheet may contain measurement, macro, goal, note and program columns together. These expand into separate dated records; supply `date` or `start_date`. Original record sheets are preferable for multiple historical observations.

Program rows group by client, source program reference/name and date; exercise rows group into training days. Workout rows sharing a source key/date/client group into one session with multiple exercises. Conflicting completion/notes in one grouped session are rejected. Imported programs remain historical records and can be copied explicitly into a draft from the client hub.

`meals_json` is an array of `{name,time,foods,calories,protein,carbs,fat}` objects. Food quantities can be written in `foods`. `content_json` follows the existing validated program structure and is an alternative to flattened exercise rows. Structured cells are JSON text, not Excel formulas.

Example weight-history CSV for an existing client:

```csv
email,date,weight,source_key
client@example.com,2026-01-01,90,source-weight-jan
client@example.com,2026-02-01,87,source-weight-feb
client@example.com,2026-03-01,85,source-weight-mar
```

All three records are retained. Corrections use a new source key rather than changing the historical row.

## Export and portability

`/api/export?type=xlsx` exports real separate worksheets for clients, measurements, macro targets/actuals, workout history, programs, templates, goals, check-ins, trainer notes, messages, subscriptions, payments and optional progress-photo metadata. The caller's tenant/role controls every included row. Client exports exclude trainer-private notes. JSON and the original basic clients CSV remain available.

Workbooks preserve date-level history, supported coaching payloads, source keys, workout prescriptions and template metadata. A source-to-second-trainer reconciliation test verifies the supported historical coaching records.

Exceptions are explicit:

- Linked subscription renewal references (`previous_ref`) and ledger reversal rows (`payment_kind=reversal`, `reverses_ref`) are exported for completeness but rejected by generic import. Use reconciled finance migration or the existing subscription/reversal screens. They are never turned into ordinary payments silently.
- Photo metadata and check-in photo IDs are exported. Binary files and signed URLs are not embedded. Nonempty foreign `photo_ids_json` values require re-upload/relinking in the target account; they are rejected rather than granting cross-account access. Skip the metadata-only ProgressPhotos sheet explicitly when migrating other data.
- Imported program history is not a restoration of publication/draft state. Review and explicitly publish a new draft as needed. Review status/feedback and entry dates are preserved; original event timestamps, foreign authentication IDs and raw media objects are not portable through this importer.
- Excel cells exceeding 32,767 characters produce an explicit export error; use JSON for those records.

## Limits

Up to 100 worksheets, 100 columns and 10,000 data rows total. Parser file limit: 5 MiB locally; hosted upload limit: 4 MB, accounting for platform request limits. Expanded ZIP content is limited to 20 MiB. Formula cells, malformed archives and invalid UTF-8 are rejected. Normalized request/batch size is checked before writing; split larger migrations into separately reviewed batches. A single very large field or dense workbook can hit the byte limit before the row limit.

The 10,000-record test executes the database import and checks the stored count. It is a local PostgreSQL-compatible test, not a claim about hosted throughput or a service-level guarantee.
