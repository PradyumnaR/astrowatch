# backend/scripts/test_embedding_memory.py
import os
import psutil

process = psutil.Process(os.getpid())


def mem_mb() -> float:
    return process.memory_info().rss / (1024 * 1024)


print(f"Baseline memory (before import): {mem_mb():.1f} MB")

from sentence_transformers import SentenceTransformer

print(f"Memory after importing sentence_transformers: {mem_mb():.1f} MB")

model = SentenceTransformer("all-MiniLM-L6-v2")

print(f"Memory after loading model: {mem_mb():.1f} MB")

embedding = model.encode("When can I see the ISS tonight?", normalize_embeddings=True)

print(f"Memory after one embedding call: {mem_mb():.1f} MB")
print(f"Embedding dimension: {len(embedding)}")
