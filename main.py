from pydriller import Repository
import numpy as np

rm = Repository("https://github.com/accuguide/accuguide")
changed_methods = []
for commit in rm.traverse_commits():
    amount = 0
    for m in commit.modified_files:
        amount += len(m.changed_methods)
    if amount > 0:
        changed_methods.append(amount)
    print(amount)

def describe(data, name):
    arr = np.array(data)
    print(f"{name}:")
    print("  mean:", np.mean(arr))
    print("  std:", np.std(arr))
    print("  25% quartile:", np.percentile(arr, 25))
    print("  75% quartile:", np.percentile(arr, 75))
    print()

# describe(size, "Size")
# describe(complexity, "Complexity")
# describe(interface, "Interface")

describe(changed_methods, "changed methods")