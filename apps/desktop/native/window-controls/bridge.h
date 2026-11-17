#pragma once
#include <node_api.h>
#include <cstring>

static bool ReadHandle(napi_env env, napi_value value, void **handle) {
    bool isBuffer = false;
    void *data;
    size_t length;
    if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer ||
        napi_get_buffer_info(env, value, &data, &length) != napi_ok || length != sizeof(void *)) {
        napi_throw_type_error(env, nullptr, "Expected an Electron native window handle");
        return false;
    }
    std::memcpy(handle, data, sizeof(void *));
    return true;
}

static void CallJS(napi_env env, napi_value callback, void *, void *) {
    if (!env || !callback) return;
    napi_value receiver;
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, 0, nullptr, nullptr);
}

static napi_threadsafe_function CreateCallback(napi_env env, napi_value callback) {
    napi_valuetype type;
    if (napi_typeof(env, callback, &type) != napi_ok || type != napi_function) {
        napi_throw_type_error(env, nullptr, "Expected a minimize callback");
        return nullptr;
    }
    napi_value name;
    napi_create_string_utf8(env, "YomitomoWindowMinimize", NAPI_AUTO_LENGTH, &name);
    napi_threadsafe_function result;
    if (napi_create_threadsafe_function(env, callback, nullptr, name, 0, 1,
                                      nullptr, nullptr, nullptr, CallJS, &result) != napi_ok) {
        napi_throw_error(env, nullptr, "Unable to create the minimize callback");
        return nullptr;
    }
    napi_unref_threadsafe_function(env, result);
    return result;
}

static napi_value Undefined(napi_env env) {
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Install(napi_env, napi_callback_info);
static napi_value Uninstall(napi_env, napi_callback_info);
static napi_value RequestMinimize(napi_env, napi_callback_info);
static void Cleanup(void *);

static napi_value Module(napi_env env, napi_value exports) {
    napi_property_descriptor methods[] = {
        {"install", nullptr, Install, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"uninstall", nullptr, Uninstall, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"requestMinimize", nullptr, RequestMinimize, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, 3, methods);
    napi_add_env_cleanup_hook(env, Cleanup, nullptr);
    return exports;
}

NAPI_MODULE(window_controls, Module)
