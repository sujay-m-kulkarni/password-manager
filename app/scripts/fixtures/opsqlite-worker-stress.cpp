// Stress test for patches/@op-engineering+op-sqlite: see scripts/opsqlite-patch.test.mjs.
// Like Vault: open a connection (new worker), close it (shutdown + join), keep the object;
// later the objects are freed from other, newer threads — as JS garbage collection does.
#include "OPWorkerThread.hpp"
#include <cstdio>
#include <memory>
#include <vector>
using namespace opsqlite;
int main() {
  std::vector<std::shared_ptr<WorkerThread>> closed;
  int crashes = 0;
  for (int round = 0; round < 200; round++) {
    for (int i = 0; i < 20; i++) {
      auto w = std::make_shared<WorkerThread>();
      w->shutdown();            // db.close()
      closed.push_back(w);      // JS object still alive until GC
    }
    // "GC" frees them on a newly created thread, which may get a reused id
    std::thread gc([&] {
      for (auto &w : closed) {
        try { w.reset(); } catch (const std::system_error &e) { crashes++; w.reset(); }
      }
    });
    gc.join();
    closed.clear();
  }
  printf("%d\n", crashes);
}
