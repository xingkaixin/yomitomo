{
  "targets": [{
    "target_name": "window_controls",
    "conditions": [
      ["OS=='mac'", {
        "sources": ["mac.mm"],
        "link_settings": {"libraries": ["-framework Cocoa"]},
        "xcode_settings": {
          "CLANG_ENABLE_OBJC_ARC": "YES",
          "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
          "MACOSX_DEPLOYMENT_TARGET": "12.0"
        }
      }],
      ["OS=='win'", {
        "sources": ["win.cc"],
        "libraries": ["Comctl32.lib"]
      }]
    ]
  }]
}
