<template>
    <div>
        <button class="button primary split">{{title}}
            <span data-dropdown="drop" v-on:click="toggleSplitOpen">
                <i class="fa fa-chevron-down"></i>
            </span>
        </button><br>
        <ul id="drop" class="f-dropdown" :style="position">
            <li><a href="#">This is a link</a></li>
            <li><a href="#">This is another</a></li>
            <li><a href="#">Yet another</a></li>
        </ul>
    </div>
</template>

<script>
export default {
    props: ['title'],
    data() {
        return {
            splitOpen: false
        };
    },
    computed: {
        position() {
            if(this.splitOpen) {
                return "position: absolute; left: 100px; top: 70px;";
            }
            return "position: absolute; left: -9999px; top: 70px;";
        }
    },
    methods: {
        toggleSplitOpen() {
            this.splitOpen = !this.splitOpen;
        }
    }
};
</script>

<style lang="sass">
.f-dropdown {
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
