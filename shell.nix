{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    just
    nodejs-slim # syntax check + unit tests
    glib        # glib-compile-schemas
    zip         # release zip
  ];
}
