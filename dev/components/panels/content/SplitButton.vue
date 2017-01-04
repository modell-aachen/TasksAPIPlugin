<template>
    <div class="split-wrapper">
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
.split-wrapper {
    display: inline-block;
}
ul.f-dropdown {
    text-align: left;
    box-shadow: 1px 1px 10px 1px rgba(0, 0, 0, 0.2);
    border-radius: 5px;
    list-style: none;
    background: white;
    border: #ccc;
    height: auto;
    width: 100%;
    max-width: 200px;
    z-index:100;
    margin: 5px 0px;
    padding: 0;
    width: auto;
	&.open {
		display: block;
	}
    li {
        padding: 3px 14px;
        font-weight: bold;
        &:hover {
            background-color: lightgray;
        }
    }
}
.split.button{
    margin-bottom: 1px;
    padding: 7px 42px 9px 10px;
    position: relative;
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
            top: 23%;
            left: 27%;
        }
    }
}
</style>
