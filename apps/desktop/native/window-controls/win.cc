#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <unordered_map>
#include "bridge.h"

static std::unordered_map<HWND, napi_threadsafe_function> bridges;
static constexpr UINT_PTR subclassId = 1;

static LRESULT CALLBACK WindowProcedure(HWND window, UINT message, WPARAM wParam,
                                       LPARAM lParam, UINT_PTR, DWORD_PTR) {
    if (message == WM_SYSCOMMAND && (wParam & 0xFFF0) == SC_MINIMIZE) {
        auto bridge = bridges.find(window);
        if (bridge != bridges.end()) {
            // Queue JavaScript after the native callback returns; V8 must not re-enter the window procedure.
            napi_call_threadsafe_function(bridge->second, nullptr, napi_tsfn_nonblocking);
            return 0;
        }
    }
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, WindowProcedure, subclassId);
        auto bridge = bridges.find(window);
        if (bridge != bridges.end()) {
            napi_release_threadsafe_function(bridge->second, napi_tsfn_abort);
            bridges.erase(bridge);
        }
    }
    return DefSubclassProc(window, message, wParam, lParam);
}

static void Remove(HWND window) {
    auto bridge = bridges.find(window);
    if (bridge == bridges.end()) return;
    RemoveWindowSubclass(window, WindowProcedure, subclassId);
    napi_release_threadsafe_function(bridge->second, napi_tsfn_abort);
    bridges.erase(bridge);
}

static napi_value Install(napi_env env, napi_callback_info info) {
    size_t count = 2;
    napi_value args[2];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 2 || !ReadHandle(env, args[0], &handle)) return nullptr;
    HWND window = static_cast<HWND>(handle);
    if (!IsWindow(window) || GetWindowThreadProcessId(window, nullptr) != GetCurrentThreadId()) {
        napi_throw_error(env, nullptr, "Expected a window on the Electron main thread");
        return nullptr;
    }
    napi_threadsafe_function callback = CreateCallback(env, args[1]);
    if (!callback) return nullptr;
    Remove(window);
    if (!SetWindowSubclass(window, WindowProcedure, subclassId, 0)) {
        napi_release_threadsafe_function(callback, napi_tsfn_abort);
        napi_throw_error(env, nullptr, "Unable to intercept native minimization");
        return nullptr;
    }
    bridges.emplace(window, callback);
    return Undefined(env);
}

static napi_value Uninstall(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value args[1];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 1 || !ReadHandle(env, args[0], &handle)) return nullptr;
    Remove(static_cast<HWND>(handle));
    return Undefined(env);
}

static napi_value RequestMinimize(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value args[1];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 1 || !ReadHandle(env, args[0], &handle)) return nullptr;
    SendMessageW(static_cast<HWND>(handle), WM_SYSCOMMAND, SC_MINIMIZE, 0);
    return Undefined(env);
}

static void Cleanup(void *) {
    while (!bridges.empty()) Remove(bridges.begin()->first);
}
