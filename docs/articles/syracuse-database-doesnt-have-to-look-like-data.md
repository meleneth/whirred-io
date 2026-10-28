# The Database Doesn't Have to Look Like the Data

## The schema that pissed me off

Different solar inverters reported different measurements. The production system I was working with gave every client a physical database table and tried to fit those varying measurements into fixed columns. Records had large numbers of `NULL` values. Then positional inserts made it worse: when the position of an incoming value did not match the intended database column, a measurement landed under the wrong name. People were manually patching the mismatches instead of fixing the design.

That was not just wasted space or an ugly schema. Customer identity determined the physical table, even though device capability determined which measurements existed. A new client meant another table; a new capability meant another column somewhere; querying across clients meant reconciling those tables. The `NULL`s reflected that confusion. The positional writes turned it into a correctness problem: a stored number could look valid while claiming to be a different measurement. Hand corrections made the consequences recurring maintenance work. That was the system that drove me to build [Syracuse](https://github.com/meleneth/syracuse) in 2014.

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

The [Redis importer](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L11-L47) reads JSON records, resolves each measurement name to a definition for that device, and writes its value. The essential part is [the measurement loop](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L42-L49):

```ruby
fields.each do |field|
  @columns_by_device_serial[serial] = Hash.new unless @columns_by_device_serial.has_key? serial
  columns = @columns_by_device_serial[serial]
  columns[field] = DeviceColumn.find_or_create_by(:device_id => device.id, :name => field) unless columns.has_key? field
  column = columns[field]
  @importer.insert(data["t"], column.id, data[field])
end
```

For example, two separate records in the [format read by the importer](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/lib/redis_device_data_importer.rb#L25-L47) could be:

```json
{"serial":"INV-42","t":1404000120,"dc_voltage":310.0,"ac_power":4200.0}
```

```json
{"serial":"INV-42","t":1404000180,"dc_voltage":312.0}
```

Suppose the importer creates device `42` and measurement definitions `7` and `8`. The `devices` row identifies the inverter:

| `devices.id` | `devices.name` |
| ---: | --- |
| 42 | `INV-42` |

The `device_columns` rows map measurement names to that device:

| `device_columns.id` | `device_id` | `name` |
| ---: | ---: | --- |
| 7 | 42 | `dc_voltage` |
| 8 | 42 | `ac_power` |

The [weekly child table `device_data_2014_25`](https://github.com/meleneth/syracuse/blob/7a12d87393d8a010a947157180c673012c1ac274/db/schema.rb#L2062-L2067) then has **exactly three observation rows** from those two records:

| `event_time` | `device_column_id` | `data` |
| ---: | ---: | ---: |
| 1404000120 | 7 | 310.0 |
| 1404000120 | 8 | 4200.0 |
| 1404000180 | 7 | 312.0 |

`device_id` belongs to the mapping row, not the observation row. Each stored value carries a `device_column_id` that identifies both its measurement and, through that mapping, its device. That identity is resolved before insertion; the meaning of `310.0` does not depend on where `dc_voltage` appeared among the incoming measurements or on a device-specific physical column position. This representation does not prevent every ingestion mistake, but it removes the measurement-to-column positional correspondence the old system relied on.

The second record has no `ac_power`, so the child table has no fourth row for it. The partitioned history stores the reported values, not rows padded with `NULL`s for measurements the device did not send. If a later record introduces `heatsink_temp`, Syracuse creates another definition and observation, not a new physical column.

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

For those two input records, with `ac_power` absent from the second, the result would look like this:

| `date_when` | `dc_voltage` | `ac_power` |
| ---: | ---: | ---: |
| 1404000120 | 310.0 | 4200.0 |
| 1404000180 | 312.0 | `NULL` |

**Device JSON → measurement definitions and narrow observations → PostgreSQL `crosstab()` → device-specific wide result.** The first and last shapes are interfaces. The middle one is storage.

That `NULL` is produced by the pivot because this timestamp has no `ac_power` observation. There is no corresponding `NULL` row in the partitioned observation table. The query result is shaped for a consumer without permanently allocating storage columns for every possible measurement. The same physical observation table can return different columns for a different device.

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

I would keep the representation and change some of the machinery. `gen_query` puts `DeviceColumn#name` into a SQL column declaration without quoting it as an identifier; an unusual or untrusted measurement name can break the query or inject SQL. `DeviceData#insert` also interpolates values directly into SQL. Generated identifiers need proper quoting, and data values need binding.

The schema has no uniqueness constraint on `(device_id, name)` or on `(event_time, device_column_id)`. Concurrent discovery could create duplicate definitions; repeated ingestion could create duplicate observations. Explicit measurement identity is a better model, but these missing constraints still leave its integrity dependent on application behavior.

The most revealing framework limitation is in the checked-in `schema.rb`: it lists the weekly children as ordinary tables and loses their PostgreSQL `INHERITS` relationships and timestamp `CHECK` constraints. Loading that file would not recreate the database the code expects. The repository also leaves `tablefunc`, which supplies `crosstab()`, to be installed separately. Per-measurement inserts, uncalled child-index creation, and tests that do not exercise the pivot are further limits of this 2014 implementation; they do not change the storage and query argument.

## The actual lesson

The device's JSON, the database's rows, and the query's columns serve different purposes. They do not have to look alike. Syracuse stored measurements with explicit identities, then asked PostgreSQL to return the shape the caller wanted. Consumers did not have to inherit the narrow storage model.

**Show me your database tables and I'll tell you your features.** A table per customer tells me the application will keep tripping over customers whenever it tries to understand measurements. In the old system, that confusion reached the writes: position could determine what a value supposedly meant. Syracuse's tables say something more truthful: devices have measurements, observations have times and values, and a wide result is available when the caller needs it.
