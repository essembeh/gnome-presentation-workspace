uuid := "presentation-workspace@essembeh.org"
zip := uuid + ".shell-extension.zip"

# List the recipes
default:
    @just --list

# What the CI runs
check: syntax test markdown schemas

# ESM syntax check (node --check reads CJS from a path, so feed it on stdin)
syntax:
    for f in src/*.js; do node --input-type=module --check < "$f" || exit 1; done

test:
    node tests/unit.mjs

markdown:
    node tests/check-markdown.mjs

schemas:
    glib-compile-schemas --strict src/schemas/

zip: check
    rm -f {{zip}}
    cd src && zip -r ../{{zip}} *.js metadata.json stylesheet.css schemas/

# Install into the real session (log out/in to load it on Wayland)
install: zip
    gnome-extensions install --force {{zip}}
