# Nightscout to InfluxDB

A tool for pulling Nightscout data into InfluxDB.

## Getting started

- Download the binary from the
  [releases page](https://github.com/nielsmaerten/nightscout-influxdb/releases)
- Or, build it yourself:
  ```bash
  git clone https://github.com/nielsmaerten/nightscout-influxdb
  cd nightscout-influxdb/
  make
  ```

### First run

- Copy `example.env` to `.env` and fill in the values
- Use the `--env` flag if the file is not in the working directory:
```
nightflux [--env /path/to/.env]
```

By default, running `nightflux` will attempt to transfer all entries from
your Nightscout site to the target InfluxDB. If you want to use a custom
timeframe, use the `--from` and `--to` flags:

```bash
nightflux [--from 2024-10-01] [--to 2024-11-01]
```

### Crontab

To periodically pull your latest Nightscout entries into InfluxDB, simply run
this tool as a cron job.

## Roadmap

- [x] Entries (just sensor values)
- [ ] Treatments (boluses, carbs, etc...)

## Work in progress

This is a Saturday-afternoon kinda project. Not everything may work as intended.
