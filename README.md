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

Copy [`example.env`](./example.env) to `.env`. Make sure to fill in the required
values.

By default, running `nightflux` will attempt to transfer all entries from
your Nightscout site to the target InfluxDB. If you want to use a custom
timeframe, use the `--from` and `--to` flags:

```bash
nightflux [--from 2024-10-01] [--to 2024-11-01]
```

### Using a custom env file

You can specify a custom path to an env file using the `--env` option. By default, the tool will look for a `.env` file in the same directory. To use a different env file, run:

```bash
nightflux --env /path/to/your/custom.env
```

### Crontab

To periodically pull your latest Nightscout entries into InfluxDB, simply run
this tool as a cron job.

## Roadmap

- [x] Entries (just sensor values)
- [ ] Treatments (boluses, carbs, etc...)

## Work in progress

This is a Saturday-afternoon kinda project. Not everything may work as intended.
