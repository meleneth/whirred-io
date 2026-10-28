# The Database Doesn't Have to Look Like the Data

## The schema that pissed me off

Different solar inverters reported different measurements. The production system I was working with represented that variability using separate tables per client, with columns that were often `NULL` because a device did not report that measurement. That design was bad enough to make me build [Syracuse](https://github.com/meleneth/syracuse), a Rails and PostgreSQL project from 2014, around a different representation.

The problem was not that `NULL` exists. It was that the database layout claimed customer identity determined measurement structure. It did not. Device capability did. A new client meant another table; a newly reported measurement meant a schema change somewhere; asking for the same measurement across clients meant negotiating a collection of different tables. The columns also confused “this device did not report a value at this time” with “this device has no such measurement.” Those are different facts.

I wanted the ingest format to remain convenient for devices and the query result to remain convenient for consumers. I did not want either of those interfaces to dictate the physical tables.

**Ingest wide. Store narrow. Query wide.**

## Store what actually exists

The [checked-in Syracuse schema](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/db/schema.rb#L19-L32) contains these definitions. The excerpt puts `devices` first for readability; in `schema.rb`, that block is [near the end](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/db/schema.rb#L3166-L3171), after the generated weekly tables.

```ruby
create_table "devices", force: true do |t|
  t.string   "name"
  t.datetime "created_at"
  t.datetime "updated_at"
end

create_table "device_columns", force: true do |t|
  t.string   "name"
  t.integer  "device_id"
  t.datetime "created_at"
  t.datetime "updated_at"
end

create_table "device_data", id: false, force: true do |t|
  t.integer "event_time"
  t.integer "device_column_id"
  t.float   "data"
end
```

`devices.name` holds the incoming serial number as a string. A `device_columns` row names one measurement for one device. Each `device_data` row holds one numeric value at one Unix timestamp for one of those definitions. “Column” is the project's name for a measurement definition; it is not a physical column in `device_data`.

The [Redis importer](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L11-L22) pops JSON records from the `device_data` list. For each record it finds or creates a device by `serial`, skips the `serial` and `t` keys, then finds or creates a `DeviceColumn` for each remaining key using `(device_id, name)`. The decisive lines are [the measurement loop](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L35-L47):

```ruby
fields.each do |field|
  @columns_by_device_serial[serial] = Hash.new unless @columns_by_device_serial.has_key? serial
  columns = @columns_by_device_serial[serial]
  columns[field] = DeviceColumn.find_or_create_by(:device_id => device.id, :name => field) unless columns.has_key? field
  column = columns[field]
  @importer.insert(data["t"], column.id, data[field])
end
```

The importer caches devices and definitions in memory so it does not look them up again for every record in that process.

For example, a record in the [format read by the importer](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L25-L47) could be:

```json
{"serial":"INV-42","t":1404000120,"dc_voltage":310.0,"ac_power":4200.0}
```

becomes two measurement definitions for `INV-42` and two observations. Suppose those definitions receive IDs `7` and `8`:

| `event_time` | `device_column_id` | `data` |
| ---: | ---: | ---: |
| 1404000120 | 7 (`dc_voltage`) | 310.0 |
| 1404000120 | 8 (`ac_power`) | 4200.0 |

If the next record includes `heatsink_temp`, the importer can create another definition and insert another observation. It does not need an `ALTER TABLE` for that new measurement.

## Get the original shape back

Narrow storage is only half the decision. Making every consumer assemble observations back into device records would move the mess out of PostgreSQL and into the application. The query resolver in [DeviceData#gen_query](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data.rb#L58-L76) does the reverse transformation in the database.

Here is the relevant Ruby, copied from the project:

```ruby
columns = device.device_columns

col_nums    = columns.collect(&:id).join(", ")
col_names   = columns.map{|m| "#{m.name} FLOAT" }.join(", ")
col_mapping = columns.map{|m| "('#{m.id}'::integer)"}.join(", ")

return <<HERE
    SELECT * FROM crosstab(
    'SELECT event_time, device_column_id, data
       FROM device_data
      WHERE event_time > #{start_date.strftime('%s').to_i}
        AND event_time < #{end_date.strftime('%s').to_i}
        AND device_column_id IN (#{col_nums})
      ORDER BY 1,2',
      $$VALUES #{col_mapping} $$
    ) AS ct(date_when INTEGER, #{col_names});
HERE
```

The three generated fragments have distinct jobs. `col_nums` limits the source rows to definitions belonging to the requested device. `col_mapping` gives `crosstab()` the category IDs in the same order as the output columns. `col_names` declares those output columns and their types; PostgreSQL needs that declaration because the result shape depends on the device. The source query orders by timestamp and measurement ID, so `crosstab()` receives the row key, category key, and value it expects.

With the example definitions above, and an interval whose Unix boundaries are `1404000000` and `1404003600`, [that Ruby](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data.rb#L58-L76) produces this SQL shape:

```sql
SELECT * FROM crosstab(
  'SELECT event_time, device_column_id, data
     FROM device_data
    WHERE event_time > 1404000000
      AND event_time < 1404003600
      AND device_column_id IN (7, 8)
    ORDER BY 1,2',
  $$VALUES ('7'::integer), ('8'::integer) $$
) AS ct(date_when INTEGER, dc_voltage FLOAT, ac_power FLOAT);
```

The inner query reads narrow observations through the `device_data` parent table. The second argument maps the category IDs to result positions. **PostgreSQL's `crosstab()` performs the pivot.** Ruby builds the SQL and receives a wide relation; it does not iterate through observations to assemble a hash per timestamp. The separate [query.rb](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/query.rb#L28-L30) script demonstrates executing that generated query with `Device.connection.query(query)`.

For two records at different timestamps, with `ac_power` absent from the second, the result would look like this:

| `date_when` | `dc_voltage` | `ac_power` |
| ---: | ---: | ---: |
| 1404000120 | 310.0 | 4200.0 |
| 1404000180 | 312.0 | `NULL` |

**Device JSON → measurement definitions and narrow observations → PostgreSQL `crosstab()` → device-specific wide result.** The first and last shapes are interfaces. The middle one is storage.

That `NULL` is fine: this timestamp has no `ac_power` observation. It is a query result shaped for a consumer, not a permanently allocated storage column. The same physical observation table can return different columns for a different device.

There is a precise limit to the reconstruction: the row key is `event_time`, so all observations for a device with the same timestamp collapse into one result row. Syracuse does not store a separate sample ID or define what to do with duplicate values for the same timestamp and measurement. Also, the time predicates are strict `>` and `<`; observations exactly at either requested boundary are excluded.

That is the architectural move I cared about. We did not make consumers accommodate the storage model. We made PostgreSQL reconstruct the representation they actually wanted.

## Partitioning the history

Telemetry keeps arriving. Syracuse's [DeviceDataTable](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data_table.rb#L1-L32) represents a week, beginning on Monday and ending seven days later. `DeviceData` [precomputes those weeks](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data.rb#L4-L14) from January 2008 up to January 2018. The [migration](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/db/migrate/20140629083907_create_device_datum.rb#L1-L5) calls `create_initial_tables`. Here is the [actual table creation code](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data.rb#L16-L24):

```ruby
def create_initial_tables
  con = Device.connection
  con.execute "CREATE TABLE device_data (event_time INTEGER, device_column_id INTEGER, data FLOAT)"

  @tables.each do |table|
    sql = "CREATE TABLE #{table.table_name} (check #{table.constraint}) inherits (device_data)"
    con.execute sql
  end
end
```

`DeviceDataTable#constraint` [generates](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data_table.rb#L23-L25) `event_time >= start_no AND event_time < end_no`, where those bounds are Unix seconds for the week's start and end. `DeviceData#insert` [finds the matching week and inserts](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/device_data.rb#L42-L56) directly into its child table. The resolver reads `FROM device_data`, which includes inherited child rows in PostgreSQL. There is no trigger that routes a generic insert into the parent.

This is 2014 code, before PostgreSQL's declarative partitioning. Weekly partitions are a natural way to organize an accumulating time series, with bounded time ranges that can be managed separately. The repository does not establish a throughput or query-speed gain. It also exposes operational costs: the week list is fixed in code, dates outside it have no matching table, and the application must route every insert. `create_initial_indexes` can create a `device_column_id` index on each child, but the migration does not call it, and the stored schema shows no observation indexes. The query filters by both device definition and time; an index strategy for that actual query would need to be designed and measured.

## What I'd keep and what I'd change

I would keep the separation between measurement definitions, observations, and wide query results. I would not preserve every line of this implementation.

The most immediate defect is SQL construction. `gen_query` splices `DeviceColumn#name` directly into an output column declaration with no identifier quoting. A measurement name containing a space, punctuation, or SQL syntax can break the query; an untrusted name makes this an injection surface. `DeviceData#insert` interpolates the timestamp, definition ID, and value directly into an `INSERT` statement as well. A current implementation should validate incoming values, quote generated identifiers, and bind data values. Dynamic output columns still require deliberate identifier handling; ordinary value parameters do not solve that part.

The importer issues one insert per measurement and creates definitions on demand. That keeps the mapping simple but adds a database round trip for every field. Batching observations per record, with an explicit transaction and an idempotency rule, would be a sensible next design step. The code as written supplies no unique constraint on `(device_id, name)`, no primary key or uniqueness constraint on observations, and no foreign keys connecting these tables. Concurrent definition discovery could create duplicates, and repeated imports could create multiple values for the same `(event_time, device_column_id)`. Those are concrete integrity gaps, not claims that duplicates happened in production.

The partition code deserves the same scrutiny. I would use declarative range partitioning for a current PostgreSQL build, create future partitions deliberately, and choose indexes from measured query plans. The checked-in `schema.rb` lists the weekly tables as ordinary tables; it does not encode their `INHERITS` relationship or timestamp `CHECK` constraints. Recreating this database from that schema dump alone would therefore miss behavior the importer and resolver depend on. The repository also does not provision the `tablefunc` extension that supplies `crosstab()`; that prerequisite needs to be explicit in a reproducible setup.

Finally, the available tests check some `DeviceDataTable` naming and containment behavior. They do not exercise the importer or the pivot end to end. One table spec still expects an older exclusive-lower-bound constraint while the implementation emits `>=`, so it would fail as written. I would test the representation round trip with actual PostgreSQL rows, including a missing measurement, duplicate timestamp and category, interval boundaries, and partition edges. Those tests would pin down the semantics that matter to consumers.

## The actual lesson

The device's JSON, the database's rows, and the query's columns serve different purposes. They do not have to look alike. Syracuse stored the measurements that existed, then asked PostgreSQL to return the shape the caller wanted. That choice kept a bad physical schema from becoming the application's interface.

**Show me your database tables and I'll tell you your features.** A table per customer tells me the application will keep tripping over customers whenever it tries to understand measurements. I wanted Syracuse's tables to say something else: devices have capabilities, observations have times and values, and the result can be wide when the caller needs it.
