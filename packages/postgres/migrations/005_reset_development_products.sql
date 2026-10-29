DELETE FROM order_items;

DELETE FROM orders;

DELETE FROM products;

SELECT setval('product_code_seq', 1, false);