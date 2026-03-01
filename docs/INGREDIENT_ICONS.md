# Ingredient Icons Source

## Where Icons Come From

All ingredient icons use **Spoonacular's CDN**:

```
https://img.spoonacular.com/ingredients_100x100/{slug}.jpg
```

- **Base URL**: `https://img.spoonacular.com/ingredients_100x100/`
- **Format**: `{slug}.jpg` — the slug is a kebab-case identifier (e.g. `bell-pepper`, `olive-oil`)
- **Dimensions**: 100×100px

## How It Works in the App

1. **INGREDIENT_IMAGE_MAP** (in `app/meal-plan/page.tsx`) maps ingredient labels → Spoonacular slugs.
2. **getIngredientImageUrl(label)** looks up the slug, or falls back to the last word of the label (slugified).
3. **Fallback**: If Spoonacular 404s, we show (a) emoji from INGREDIENT_EMOJI_MAP if available, else (b) the first letter of the ingredient. No empty boxes.

## Adding Icons for New Ingredients

To get icons for more ingredients:

1. **Add to INGREDIENT_IMAGE_MAP** in `app/meal-plan/page.tsx`:
   ```ts
   "ingredient name": "spoonacular-slug",
   ```
   Use lowercase. The slug must match what Spoonacular has.

2. **Find valid slugs**: Spoonacular doesn't publish a full list. Options:
   - Try common kebab-case names (e.g. `spinach`, `mushrooms`, `salmon`)
   - Use the [Spoonacular Ingredient Search API](https://spoonacular.com/food-api/docs#Search-Ingredients) to get `image` field for an ingredient
   - Test URLs: `https://img.spoonacular.com/ingredients_100x100/{slug}.jpg`

3. **Fallback behavior**: If no map entry exists, the code uses the last word of the ingredient (e.g. "fresh basil" → tries `basil`). Add explicit mappings when the auto-guess fails.

## Example Mappings

| Ingredient label   | Slug           |
|--------------------|----------------|
| bell pepper        | bell-pepper    |
| olive oil          | olive-oil      |
| chicken broth      | chicken-broth  |
| cream cheese       | cream-cheese   |
| kosher salt        | salt           |
