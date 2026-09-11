import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { 
  Card, CardContent, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@smo/ui';
import { Search01Icon, PlusSignIcon, Loading03Icon, Image01Icon } from 'hugeicons-react';

export const StoreMenuBuilder = ({ storeId }) => {
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Add Item Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [price, setPrice] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  // Create Category State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/stores/${storeId}/menu`);
      if (res.data.success) {
        // Endpoint returns the categories array directly (each with nested items)
        const cats = Array.isArray(res.data.data) ? res.data.data : [];
        setCategories(cats);
        // Flat list of all items for preview
        setMenuItems(cats.flatMap(c => c.items || []));
      }
    } catch (err) {
      setError('Failed to fetch menu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, [storeId]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data.meals || []);
    } catch (err) {
      console.error('Failed to search MealDB', err);
    } finally {
      setIsSearching(false);
    }
  };

  const inferDietary = (category) => {
    const lower = category?.toLowerCase() || '';
    if (lower.includes('vegetarian')) return 'VEG';
    if (lower.includes('vegan')) return 'VEGAN';
    if (lower.includes('chicken') || lower.includes('beef') || lower.includes('pork') || lower.includes('lamb') || lower.includes('seafood')) return 'NON_VEG';
    return 'VEG'; // Default safe fallback
  };

  const openAddItemModal = (meal) => {
    setSelectedItem({
      name: meal.strMeal,
      image: meal.strMealThumb,
      dietary: inferDietary(meal.strCategory),
      description: meal.strCategory // use category as short description
    });
    setPrice('');
    setSelectedCategoryId('');
    setNewCategoryName('');
    setIsCreatingCategory(false);
    setIsModalOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await api.post(`/stores/${storeId}/menu/categories`, {
        name: newCategoryName,
        sortOrder: categories.length
      });
      if (res.data.success) {
        const newCat = res.data.data;
        setCategories([...categories, newCat]);
        setSelectedCategoryId(newCat.id);
        setIsCreatingCategory(false);
        setNewCategoryName('');
      }
    } catch (err) {
      console.error('Failed to create category', err);
    }
  };

  const handleAddItem = async () => {
    if (!selectedCategoryId || !price) return;
    setIsSubmitting(true);
    try {
      await api.post(`/stores/${storeId}/menu/items`, {
        categoryId: selectedCategoryId,
        name: selectedItem.name,
        description: selectedItem.description,
        price: Math.round(parseFloat(price)), // whole rupees, same unit as the rest of the app
        image: selectedItem.image,
        dietary: selectedItem.dietary,
        spiceLevel: 'NONE'
      });
      
      setIsModalOpen(false);
      fetchMenu(); // Refresh the menu preview
    } catch (err) {
      console.error('Failed to add item', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center"><Loading03Icon className="animate-spin mx-auto text-zinc-500" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Search & Results Panel */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Smart Menu Builder</h3>
          <p className="text-sm text-zinc-500 mb-6">Search for standard dishes to quickly add to your menu.</p>
          
          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <Input 
              placeholder="Search dishes (e.g. Burger, Pizza, Curry)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? <Loading03Icon className="animate-spin" size={18} /> : <Search01Icon size={18} className="mr-2" />} Search
            </Button>
          </form>

          <div className="space-y-4">
            {searchResults.map(meal => (
              <div key={meal.idMeal} className="flex flex-col sm:flex-row gap-4 items-center p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <img src={meal.strMealThumb} alt={meal.strMeal} className="w-16 h-16 rounded-md object-cover bg-zinc-200" />
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{meal.strMeal}</h4>
                  <p className="text-xs text-zinc-500">{meal.strCategory} • {meal.strArea}</p>
                </div>
                <Button size="sm" onClick={() => openAddItemModal(meal)} className="w-full sm:w-auto">
                  <PlusSignIcon size={16} className="mr-1" /> Add
                </Button>
              </div>
            ))}
            {searchResults.length === 0 && !isSearching && searchQuery && (
              <p className="text-center text-sm text-zinc-500 py-8">No results found for "{searchQuery}".</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Menu Preview Panel */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Current Menu Preview</h3>
          <div className="space-y-6">
            {categories.map(category => (
              <div key={category.id}>
                <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">{category.name}</h4>
                {category.items?.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {category.items.map(item => (
                      <div key={item.id} className="flex gap-3 items-center p-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400">
                            <Image01Icon size={20} />
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-semibold truncate text-zinc-900 dark:text-zinc-100">{item.name}</p>
                          <p className="text-xs text-zinc-500">₹{item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No items in this category.</p>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-center text-sm text-zinc-500 py-12">Your menu is currently empty. Use the Smart Builder to add items.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Item Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add to Menu</DialogTitle>
            <DialogDescription>
              Set the price and category for this item.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="flex gap-4 items-center mb-6 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
              <img src={selectedItem.image} alt={selectedItem.name} className="w-16 h-16 rounded-md object-cover shadow-sm" />
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{selectedItem.name}</h4>
                <div className="flex gap-2 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    selectedItem.dietary === 'VEG' ? 'bg-green-100 text-green-700' :
                    selectedItem.dietary === 'VEGAN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {selectedItem.dietary}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              {!isCreatingCategory ? (
                <div className="flex gap-2">
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setIsCreatingCategory(true)}>
                    New
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input 
                    placeholder="Category Name (e.g. Mains)"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                  <Button type="button" onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setIsCreatingCategory(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Price (₹)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 250"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!selectedCategoryId || !price || isSubmitting}>
              {isSubmitting ? <Loading03Icon className="animate-spin" size={16} /> : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
