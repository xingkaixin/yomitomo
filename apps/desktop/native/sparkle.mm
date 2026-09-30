#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>

@interface YomitomoSparkle : NSObject <SPUUserDriver, SPUUpdaterDelegate>
@property(nonatomic, strong) SPUUpdater *updater;
@property(nonatomic, strong) SUAppcastItem *item;
@property(nonatomic, copy) void (^installReply)(SPUUserUpdateChoice);
@property(nonatomic) napi_threadsafe_function callback;
@property(nonatomic) uint64_t total;
@property(nonatomic) uint64_t transferred;
@property(nonatomic) NSTimeInterval downloadStarted;
- (void)emit:(NSDictionary *)event;
@end

@implementation YomitomoSparkle
- (void)emit:(NSDictionary *)event {
    if (!self.callback) return;
    NSData *data = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    void *payload = (void *)CFBridgingRetain(json);
    if (napi_call_threadsafe_function(self.callback, payload, napi_tsfn_nonblocking) != napi_ok) {
        CFRelease(payload);
    }
}

- (NSDictionary *)updateEvent:(NSString *)type item:(SUAppcastItem *)item {
    return @{ @"type": type, @"version": item.displayVersionString,
              @"releaseName": item.title ?: @"", @"releaseDate": item.date ? @([item.date timeIntervalSince1970] * 1000) : @0 };
}

- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item {
    self.item = item;
    [self emit:[self updateEvent:@"update-available" item:item]];
}

- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater error:(NSError *)error {
    [self emit:@{ @"type": @"update-not-available" }];
}

- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)check error:(NSError *)error {
    if (check != SPUUpdateCheckUpdateInformation) return;
    [self emit:@{ @"type": @"check-complete", @"error": (error && error.code != SUNoUpdateError) ? error.localizedDescription : @"" }];
}

- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request reply:(void (^)(SUUpdatePermissionResponse *))reply {
    reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:NO sendSystemProfile:NO]);
}

- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {}

- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state reply:(void (^)(SPUUserUpdateChoice))reply {
    self.item = item;
    if (item.informationOnlyUpdate) {
        [self emit:@{ @"type": @"error", @"error": @"This update requires a manual download from the website." }];
        reply(SPUUserUpdateChoiceDismiss);
        return;
    }
    if (state.stage == SPUUserUpdateStageInstalling) {
        [self showReadyToInstallAndRelaunch:reply];
        return;
    }
    reply(SPUUserUpdateChoiceInstall);
}

- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)downloadData {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}

- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    [self emit:@{ @"type": @"error", @"error": error.localizedDescription }];
    acknowledgement();
}

- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    [self emit:@{ @"type": @"error", @"error": error.localizedDescription }];
    acknowledgement();
}

- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
    self.transferred = 0;
    self.total = 0;
    self.downloadStarted = [NSDate timeIntervalSinceReferenceDate];
}

- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length {
    self.total = length;
    self.transferred = 0;
}

- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {
    self.transferred += length;
    double elapsed = MAX(0.001, [NSDate timeIntervalSinceReferenceDate] - self.downloadStarted);
    [self emit:@{ @"type": @"download-progress", @"total": @(self.total),
                  @"transferred": @(self.transferred), @"bytesPerSecond": @(self.transferred / elapsed),
                  @"percent": self.total ? @(MIN(100.0, 100.0 * self.transferred / self.total)) : @0 }];
}

- (void)showDownloadDidStartExtractingUpdate {}
- (void)showExtractionReceivedProgress:(double)progress {}

- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply {
    self.installReply = reply;
    [self emit:[self updateEvent:@"update-downloaded" item:self.item]];
}

- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)terminated retryTerminatingApplication:(void (^)(void))retry {}
- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledgement { acknowledgement(); }
- (void)dismissUpdateInstallation { self.installReply = nil; }
@end

static YomitomoSparkle *bridge;

static void CallJS(napi_env env, napi_value callback, void *context, void *data) {
    NSString *json = CFBridgingRelease(data);
    if (!env || !callback) return;
    napi_value argument, receiver;
    napi_create_string_utf8(env, json.UTF8String, NAPI_AUTO_LENGTH, &argument);
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, 1, &argument, nullptr);
}

static void Cleanup(void *data) {
    if (!bridge) return;
    napi_release_threadsafe_function(bridge.callback, napi_tsfn_abort);
    bridge.callback = nullptr;
    bridge.installReply = nil;
    bridge.updater = nil;
    bridge = nil;
}

static napi_value Initialize(napi_env env, napi_callback_info info) {
    size_t count = 1;
    napi_value args[1], name;
    napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
    napi_valuetype type;
    if (count != 1 || napi_typeof(env, args[0], &type) != napi_ok || type != napi_function || bridge) {
        napi_throw_error(env, nullptr, "Sparkle requires one event callback and can only be initialized once");
        return nullptr;
    }
    bridge = [YomitomoSparkle new];
    napi_create_string_utf8(env, "YomitomoSparkle", NAPI_AUTO_LENGTH, &name);
    napi_threadsafe_function callback;
    if (napi_create_threadsafe_function(env, args[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, CallJS, &callback) != napi_ok) {
        bridge = nil;
        napi_throw_error(env, nullptr, "Unable to create the Sparkle event callback");
        return nullptr;
    }
    bridge.callback = callback;
    napi_unref_threadsafe_function(env, bridge.callback);
    napi_add_env_cleanup_hook(env, Cleanup, nullptr);
    bridge.updater = [[SPUUpdater alloc] initWithHostBundle:NSBundle.mainBundle applicationBundle:NSBundle.mainBundle userDriver:bridge delegate:bridge];
    bridge.updater.automaticallyChecksForUpdates = NO;
    bridge.updater.automaticallyDownloadsUpdates = NO;
    NSError *error = nil;
    if (![bridge.updater startUpdater:&error]) {
        Cleanup(nullptr);
        napi_throw_error(env, nullptr, error.localizedDescription.UTF8String);
        return nullptr;
    }
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Check(napi_env env, napi_callback_info info) {
    if (!bridge || bridge.updater.sessionInProgress) {
        napi_throw_error(env, nullptr, "Sparkle is unavailable or an update is already in progress");
        return nullptr;
    }
    [bridge emit:@{ @"type": @"checking-for-update" }];
    [bridge.updater checkForUpdateInformation];
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Download(napi_env env, napi_callback_info info) {
    if (!bridge || !bridge.updater.canCheckForUpdates) {
        napi_throw_error(env, nullptr, "Sparkle cannot start downloading this update");
        return nullptr;
    }
    [bridge.updater checkForUpdates];
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Install(napi_env env, napi_callback_info info) {
    if (!bridge.installReply) {
        napi_throw_error(env, nullptr, "No verified Sparkle update is ready to install");
        return nullptr;
    }
    void (^reply)(SPUUserUpdateChoice) = bridge.installReply;
    bridge.installReply = nil;
    reply(SPUUserUpdateChoiceInstall);
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value Module(napi_env env, napi_value exports) {
    napi_property_descriptor methods[] = {
        {"initialize", nullptr, Initialize, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"check", nullptr, Check, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"download", nullptr, Download, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"install", nullptr, Install, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, 4, methods);
    return exports;
}

NAPI_MODULE(sparkle, Module)
