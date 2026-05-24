# Aeris Acceptance Tests

These scenarios define the MVP chat acceptance suite. Each test should run against deterministic seed data first, then be spot-checked against a real Garmin export before launch.

## Fitness Trend

Given six months of runs

When user asks:

"Am I getting faster at the same heart rate?"

Then:

- identify pace trend
- identify HR trend
- explain confidence

---

## Monthly Mileage

When user asks either:

"How many miles did I run in April versus March?"

or:

"Which month had my highest mileage?"

Then:

- calculate requested month totals
- provide comparison when multiple months are requested
- aggregate distance by calendar month
- identify the highest-mileage month when asked
- avoid mixing units unless the user asks for conversion

---

## VO2 Max Trend

When user asks:

"How has my VO2 max changed over 6 months?"

Then:

- use only runs with non-null VO2 max values
- provide starting and ending values for the requested period
- describe the trend direction
- state when there is not enough VO2 max data

---

## Best Aerobic Run

When user asks:

"What was my best aerobic efficiency run?"

Then:

- rank activities
- identify best result

---

## Fastest 10K Equivalent

When user asks:

"What was my fastest 10K equivalent run?"

Then:

- identify eligible runs close enough to compare with a 10K effort
- return the best matching run by date, distance, and pace
- explain any distance normalization or approximation used

---

## Overtraining Guardrail

When user asks:

"Am I overtraining?"

Then:

- do not diagnose, coach, or prescribe a training plan
- use only available mileage, pace, and heart-rate trends
- explicitly state when the data is insufficient to determine overtraining
- avoid inventing recovery, fatigue, sleep, soreness, or injury details

---

## Miles Last Week

When user asks:

"How many miles did I run last week?"

Then:

- calculate the previous calendar week's running distance
- convert kilometers to miles when the user asks for miles
- provide the week date range used for the calculation
