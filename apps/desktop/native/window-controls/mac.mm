#import <Cocoa/Cocoa.h>
#include "bridge.h"

@interface YomitomoWindowMinimize : NSObject
@property(nonatomic, weak) NSButton *button;
@property(nonatomic, weak) id originalTarget;
@property(nonatomic) SEL originalAction;
@property(nonatomic) NSWindowAnimationBehavior originalAnimationBehavior;
@property(nonatomic) napi_threadsafe_function callback;
- (void)minimize:(id)sender;
@end

@implementation YomitomoWindowMinimize
- (void)minimize:(id)sender {
    if (self.callback) napi_call_threadsafe_function(self.callback, nullptr, napi_tsfn_nonblocking);
}
@end

static NSMutableDictionary<NSValue *, YomitomoWindowMinimize *> *bridges;

static void Remove(NSValue *key) {
    YomitomoWindowMinimize *bridge = bridges[key];
    if (!bridge) return;
    if (bridge.button.target == bridge) {
        bridge.button.target = bridge.originalTarget;
        bridge.button.action = bridge.originalAction;
    }
    bridge.button.window.animationBehavior = bridge.originalAnimationBehavior;
    napi_release_threadsafe_function(bridge.callback, napi_tsfn_abort);
    bridge.callback = nullptr;
    [bridges removeObjectForKey:key];
}

static napi_value Install(napi_env env, napi_callback_info info) {
    size_t count = 2;
    napi_value args[2];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 2 || !ReadHandle(env, args[0], &handle)) return nullptr;
    NSView *view = (__bridge NSView *)handle;
    NSButton *button = [view.window standardWindowButton:NSWindowMiniaturizeButton];
    if (!button) {
        napi_throw_error(env, nullptr, "Native minimize button is unavailable");
        return nullptr;
    }
    napi_threadsafe_function callback = CreateCallback(env, args[1]);
    if (!callback) return nullptr;
    if (!bridges) bridges = [NSMutableDictionary new];
    NSValue *key = [NSValue valueWithPointer:handle];
    Remove(key);
    YomitomoWindowMinimize *bridge = [YomitomoWindowMinimize new];
    bridge.button = button;
    bridge.originalTarget = button.target;
    bridge.originalAction = button.action;
    bridge.originalAnimationBehavior = view.window.animationBehavior;
    // The reader already animates the discussion to its final size before AppKit orders it in.
    view.window.animationBehavior = NSWindowAnimationBehaviorNone;
    bridge.callback = callback;
    bridges[key] = bridge;
    button.target = bridge;
    button.action = @selector(minimize:);
    return Undefined(env);
}

static napi_value Uninstall(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value args[1];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 1 || !ReadHandle(env, args[0], &handle)) return nullptr;
    Remove([NSValue valueWithPointer:handle]);
    return Undefined(env);
}

static napi_value RequestMinimize(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value args[1];
    void *handle;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    if (count != 1 || !ReadHandle(env, args[0], &handle)) return nullptr;
    NSView *view = (__bridge NSView *)handle;
    [[view.window standardWindowButton:NSWindowMiniaturizeButton] performClick:nil];
    return Undefined(env);
}

static void Cleanup(void *) {
    for (NSValue *key in bridges.allKeys) Remove(key);
    bridges = nil;
}
