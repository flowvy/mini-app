-- Create a separate database for tests so dev data stays clean.
CREATE DATABASE test;
CREATE USER test WITH PASSWORD 'test';
GRANT ALL PRIVILEGES ON DATABASE test TO test;
ALTER DATABASE test OWNER TO test;
