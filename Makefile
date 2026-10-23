.PHONY: up down seed test

up:    ## Build and start everything
	docker compose up --build

down:  ## Stop everything (keeps the database volume)
	docker compose down

seed:  ## Wipe the database and load the demo data again
	docker compose run --rm migrate node src/db/seed.ts --reset

test:  ## Run the backend tests in Docker
	docker compose --profile test run --rm --build api-test
