# My MMEX Progressive Web App (PWA) Version

![Unit Tests](https://github.com/gjchentw/mmex-pwa/actions/workflows/test.yml/badge.svg?branch=master)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
```

## Constitution Compliance Review

Generate and validate constitution compliance reports:

```bash
npm run compliance:run
npm run compliance:validate
```

Outputs:

- `reports/compliance/master-baseline.json`
- `reports/compliance/local-delta.json`

Both outputs are validated against:

- `specs/001-review-constitution-compliance/contracts/compliance-report.schema.json`
