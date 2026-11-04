from test_product_api import product, M1_RID
from accessfix.storage import write_json


def test_public_copy_is_distinct_from_original_evidence(product):
    client, _, archives = product
    marker = archives / 'repairs' / M1_RID / 'copy-provenance.json'
    write_json(marker, {'schema_version': 1, 'public_copy': True, 'source_record_sha256': 'a' * 64})
    detail = client.get('/api/runs/m1-ai').json()
    assert detail['archive_source']['copied'] is True
    assert detail['archive_source']['source_sha256'] == 'a' * 64
    assert detail['archive_source']['public_subset'] is True
    assert detail['repair']['decision']['accepted'] is True
    assert detail['repair']['status'] == 'restored'
    assert detail['actions']['repair_url'] is None


def test_invalid_public_marker_fails_closed(product):
    client, _, archives = product
    write_json(archives / 'repairs' / M1_RID / 'copy-provenance.json',
               {'schema_version': 1, 'public_copy': True, 'source_record_sha256': '../../private'})
    assert client.get('/api/runs/m1-ai').status_code == 400
