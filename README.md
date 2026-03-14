# spendcheck

a small expense tracker i wrote on a slow weekend. add expenses, see them on a couple of charts, and get a rough forecast of next month based on the past months. nothing fancy, no accounts, no cloud, the whole thing is one node process and a json file on disk.

i kept wanting to know "if i keep going at this rate, where am i landing next month" and a spreadsheet felt heavier than i wanted, so this is the smaller version of that.

## what it does

- add expenses (amount, category, date, optional note)
- list and delete them
- daily spending bar chart with a 7-day moving average line
- monthly totals chart
- a "next month forecast" tile, computed with a least-squares linear regression over your monthly totals
- shows the standard deviation of monthly totals
- flags any individual expense that is more than 2 standard deviations above its category mean (only kicks in once a category has at least 3 entries, otherwise it is just noise)

## the math

the forecast tile fits a straight line through your past monthly totals, treating month index as `x` and the month total as `y`. the closed-form least-squares solution:

```
slope     = (n * Sxy - Sx * Sy) / (n * Sxx - Sx * Sx)
intercept = (Sy - slope * Sx) / n
```

where `Sx` is the sum of x, `Sy` the sum of y, `Sxy` the sum of x*y, and `Sxx` the sum of x squared. next month's prediction is just `slope * next_x + intercept`. if the slope is negative the forecast tile says "trending down".

the moving average is the obvious one: for each day, take the mean of that day and the previous six days. standard deviation is the population variant (divide by n).

this is all in `public/script.js` if you want to read it.

## stack

- node 18+ and express
- vanilla html, css, js for the frontend
- chart.js from a cdn
- a json file at `data/expenses.json` for storage (gitignored, made on first save)

## running it

```
git clone https://github.com/secanakbulut/spendcheck.git
cd spendcheck
npm install
npm start
```

then open http://localhost:3000. that is it.

## api

if you want to poke at it directly:

- `GET /api/expenses` returns all rows, newest first
- `POST /api/expenses` with json `{ amount, category, date, note? }`
- `DELETE /api/expenses/:id`

## where things live

- `server.js` express app, file io
- `public/index.html` markup
- `public/script.js` charts, math, form handling
- `public/style.css` styling

## license

PolyForm Noncommercial 1.0.0. fine for personal and non-commercial use, see `LICENSE` if you want the long version.
