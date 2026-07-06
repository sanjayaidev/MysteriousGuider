-- Create prompts table
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    headline VARCHAR(255) NOT NULL,
    description TEXT,
    full_prompt TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    sub_category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    demo_image_url VARCHAR(500),
    max_images_allowed INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_prompts_category ON prompts(category);
CREATE INDEX idx_prompts_sub_category ON prompts(sub_category);
CREATE INDEX idx_prompts_is_active ON prompts(is_active);
CREATE INDEX idx_prompts_headline ON prompts(headline);

-- Create categories table for dynamic categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample categories
INSERT INTO categories (name) VALUES 
    ('Nature'),
    ('Portrait'),
    ('Abstract'),
    ('Technology'),
    ('Retro'),
    ('Fantasy'),
    ('Minimalist')
ON CONFLICT (name) DO NOTHING;

-- Insert sample prompts
INSERT INTO prompts (headline, description, full_prompt, category, sub_category, tags, demo_image_url, max_images_allowed) VALUES 
    ('Sunset Over Ocean', 'A beautiful sunset with golden reflections', 'A stunning sunset over the ocean with golden orange and purple skies, waves gently crashing', 'Nature', 'Ocean', ARRAY['sunset', 'ocean', 'golden hour'], 'https://via.placeholder.com/300x200', 1),
    ('Cyberpunk City', 'Futuristic city with neon lights', 'A cyberpunk cityscape at night with neon signs, flying cars, and rain-slicked streets', 'Technology', 'Cyberpunk', ARRAY['cyberpunk', 'neon', 'future'], 'https://via.placeholder.com/300x200', 2),
    ('Vintage Camera', 'Classic film camera illustration', 'A detailed illustration of a vintage film camera from the 1960s', 'Retro', 'Photography', ARRAY['vintage', 'camera', 'film'], 'https://via.placeholder.com/300x200', 1),
    ('Mystical Forest', 'Enchanted forest with glowing elements', 'An enchanted forest with bioluminescent plants, glowing mushrooms, and mysterious fog', 'Fantasy', 'Forest', ARRAY['forest', 'magical', 'glowing'], 'https://via.placeholder.com/300x200', 3);
