ALTER TABLE store_delivery_people ADD COLUMN experience_years smallint CHECK(experience_years BETWEEN 0 AND 60), ADD COLUMN rating smallint CHECK(rating BETWEEN 1 AND 5);
