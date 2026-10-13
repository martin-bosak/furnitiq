Lets create a web app for home layout designer

# Main Use case:
## Case A (optional for now):
- user would upload pictures of his apartment
- ai would create a model of this aparment, and creat wall schema
- ai would also recognize current furniture and model it there
- fith focus on walls/windows and furniture
- this creates a model and saves it (is there any existing format that we can leverage)

## Case B:
- Case A steps would be created by another agent (using a skill and potentionally an mcp?)

## Main app window:
- load the layout model
- two parts of screen 
    ### one with layout model with walls/windows/furniture + camera(s?) position/angle
    - make possible to move existing obejct or camera or select location
    ### second with render of visualised picture
    - showing image from camera
    - + photo button, creating photorealistic visual
+ chat window to modify existing model (also adding selected position into context)


# Technology
- for now no login etc
- use someting hosting database for storing data
- for AI use OpenAI interface, and connect it to OpenRouter, or as a second option - can we leverage Allio agents? - to specify which agent would receive the task.

# Design
Lets use super modern design with latest technologies and ultra modern look. 
Focus on good UX and simple UI, but implement high tech stuff.
Round, minimalistic, futuristic, glass

# Questions
- is this possible on web app? 
- would something as local application be better?
- would we need sth like a local blender for that?