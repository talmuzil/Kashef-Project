import pytest
import time
import firebase_admin
from firebase_admin import credentials, db
import pandas as pd
from datetime import datetime

# This line ensures the test can "see" all the logic inside app.py
from app import (
    match_products,
    model,
    create_search_text,
    preprocess_text,
    ai_semantic_similarity,  # <--- Make sure this is here
    keyword_score
)
# 1. Setup Firebase for Testing
if not firebase_admin._apps:
    cred = credentials.Certificate("kashef-7d7b1-firebase-adminsdk-fbsvc-f744b83dba.json")
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://kashef-7d7b1-default-rtdb.firebaseio.com'
    })


def test_data_integrity():
    """Validates that Firebase data has the required fields."""
    ref = db.reference("amazon-products").order_by_key().limit_to_first(1).get()
    assert ref is not None, "Firebase connection failed"
    for key, val in ref.items():
        assert 'price' in val, f"Product {key} is missing a price field"


def test_matching_accuracy():
    """Validates that the AI correctly identifies similar products (Result = 1)."""
    source = pd.DataFrame([{'title': 'iPhone 15'}])
    target = pd.DataFrame([{'title': 'iPhone 15 Silicon Case Blue', 'price': 900}])

    results = match_products(source, target)
    assert not results.empty
    assert results.iloc[0]['ai_similarity'] > 0.6


def test_system_latency():
    """Validates that semantic logic is fast (Logic Speed < 5s)."""
    model.encode(["warmup"])  # Prevent cold-start delay
    start_time = time.time()

    # Fetch small sample to test logic, not network speed
    data = db.reference("amazon-products").order_by_key().limit_to_first(10).get()
    df = pd.DataFrame.from_dict(data, orient='index')

    match_products(pd.DataFrame([{'title': 'MacBook'}]), df)

    duration = time.time() - start_time
    assert duration <= 5.0, f"Logic too slow: {duration:.2f}s"


# Add to validation_plan.py
def test_history_logging():
    """Verifies that price history is recorded with a date key."""
    test_id = "test_prod_001"
    test_price = 999.99

    # Trigger the log
    from app import log_price_to_history
    log_price_to_history(test_id, test_price)

    # Verify in Firebase
    today = datetime.now().strftime('%Y-%m-%d')
    val = db.reference(f"price_history/{test_id}/{today}").get()

    assert val == test_price, "Price history was not logged correctly."