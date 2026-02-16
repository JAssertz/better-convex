# ORM Limit Safety Execution (TDD)

- [x] Add failing runtime tests for unsized `findMany` policy (error/defaultLimit/allowFullScan)
- [x] Add failing runtime tests for mutation row ceiling (`update`/`delete`)
- [x] Implement schema defaults metadata (`defaultLimit`, `mutationBatchSize`, `mutationMaxRows`)
- [x] Implement query limit resolution and remove implicit `1000` fallback
- [x] Enforce nested `many` relation sizing policy
- [x] Implement bounded mutation row collection (no unbounded `collect()` paths)
- [x] Run targeted tests and iterate to green
- [x] Run broader quality checks for touched areas
