<template>
    <div>
        <button class="button primary split">{{title}}
            <span data-dropdown="drop" v-on:click="toggleSplitOpen">
                <i class="fa fa-chevron-down"></i>
            </span>
        </button><br>
        <ul class="f-dropdown" v-bind:style="position">
        <slot>
            <li><h5>This is a link</h5></li>
            <li><h5>This is another</h5></li>
            <li><h5>Yet another</h5></li>
        </slot>
        </ul>
    </div>
</template>

<script>
export default {
    props: ['title'],
    data() {
        return {
            splitOpen: false,
            position: {
                position: 'fixed',
                left: '-9999px'
            }
        };
    },
    methods: {
        toggleSplitOpen() {
            this.splitOpen = !this.splitOpen;
            if(this.splitOpen){
                this.position.left = 'initial';
            } else {
                this.position.left = '-9999px';
            }
        }
    }
};
</script>

<style lang="sass">
#modacWrapper ul,
.foswikiTopic ul{
    list-style-image: none;
}
.split.button{
    margin-bottom: 1px;
}
ul.f-dropdown {
    box-shadow: 1px 1px 10px 1px rgba(0, 0, 0, 0.2);
    border-radius: 5px;
    padding-left: 5px;
    list-style: none;
    margin-left: 0;
    background: white;
    border: #ccc;
    height: auto;
    width: 100%;
    z-index:100;
    margin-top: 2px;
    max-width: 200px;
	&.open {
		display: block;
	}
}
.split.button{
    position: relative;
    padding-right: 4.5rem;
    span {
        border-left-color: rgba(255,255,255,0.5);
        border-left: solid 1px;
        display: block;
        height: 100%;
        position: absolute;
        width: 2rem;
        right: 0;
        top: 0;
        i {
            position: absolute;
            content: "";
            width: 0;
            height: 0;
            top: 33%;
            left: 33%;
        }
    }
}
</style>
