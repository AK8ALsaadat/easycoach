# Modern exercise selection and shared UI

The program editor now opens a multi-select exercise picker. The coach chooses a destination session, selects exercise cards in prescription order, and confirms the complete group with one button. Search, equipment and muscle filters preserve the selection. Closing the picker discards unconfirmed choices. The same picker creates library templates from a group of selected exercises.

The batch update creates independent row identities, preserves existing prescriptions and other sessions, and rejects groups that would exceed the 40-exercise session limit without adding a partial group. Mobile uses a full-screen sheet with a persistent confirmation area; keyboard focus starts in search and stays within the active dialog.

Movement instruction text and description fields were removed from the catalog, coach editor, custom exercise library and trainee program. Existing saved description values remain in storage for compatibility, but are neither displayed nor editable. Photo and video previews remain available. Catalog JSON no longer includes instruction arrays; the combined English metadata and Arabic name files decreased from approximately 1.81 MB to 0.31 MB. This is a source-data size measurement, not a measured loading-time improvement.

Shared light and dark styles refresh navigation, fields, buttons, cards, client boards, statistics, session navigation and exercise rows. The editor uses compact prescriptions and thumbnail rows, with secondary video and loading settings tucked away.

## Verification

- Production build and TypeScript checks, including a separate checkout of the staged source.
- ESLint on the changed TypeScript components and helpers.
- 96 unit tests, including batch order, row isolation, capacity rejection, all 876 reviewed exercise photos and absence of legacy instruction output.
- Nine browser journeys covering selection across searches, cancellation without mutation, destination day, publishing and reload, coach and trainee views, photos and video recovery, subscriptions, client statistics, dark mode, repeated sessions and mobile layouts.

Browser evidence is generated locally by the existing isolated harness, using synthetic accounts. It is kept under `.local-dev/continuous-lab/`; it is not production account data or a verification of the deployed site.
